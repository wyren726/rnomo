import { TFile, Vault } from "obsidian";

export type CollectionKind = "progress" | "review" | "inventory";
export type ProgressStatus = "planned" | "active" | "paused" | "done";
export type ReviewStatus = "planned" | "in-progress" | "done";
export type InventoryStatus = "available" | "low" | "used-up" | "archived";

export interface ProgressRecord {
	kind: "progress";
	id: string;
	title: string;
	status: ProgressStatus;
	current: number;
	total: number | null;
	unit: string;
	tags: string[];
	link: string;
	note: string;
	createdAt: string;
	updatedAt: string;
	path: string;
}

export interface ReviewRecord {
	kind: "review";
	id: string;
	title: string;
	category: string;
	status: ReviewStatus;
	rating: number;
	tags: string[];
	link: string;
	note: string;
	createdAt: string;
	updatedAt: string;
	path: string;
}

export interface InventoryRecord {
	kind: "inventory";
	id: string;
	title: string;
	category: string;
	location: string;
	quantity: number;
	unit: string;
	status: InventoryStatus;
	purchaseDate: string;
	expiryDate: string;
	tags: string[];
	link: string;
	note: string;
	createdAt: string;
	updatedAt: string;
	path: string;
}

export type CollectionRecord = ProgressRecord | ReviewRecord | InventoryRecord;

export type ProgressInput = Omit<ProgressRecord, "kind" | "id" | "createdAt" | "updatedAt" | "path">;
export type ReviewInput = Omit<ReviewRecord, "kind" | "id" | "createdAt" | "updatedAt" | "path">;
export type InventoryInput = Omit<InventoryRecord, "kind" | "id" | "createdAt" | "updatedAt" | "path">;

export const RNOMO_PROGRESS_FOLDER = "Rnomo/Progress";
export const RNOMO_REVIEW_FOLDER = "Rnomo/Reviews";
export const RNOMO_INVENTORY_FOLDER = "Rnomo/Inventory";

function folderFor(kind: CollectionKind): string {
	if (kind === "progress") return RNOMO_PROGRESS_FOLDER;
	if (kind === "review") return RNOMO_REVIEW_FOLDER;
	return RNOMO_INVENTORY_FOLDER;
}

function nowIso(): string {
	return new Date().toISOString();
}

function slugify(value: string): string {
	const slug = value.trim().toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
	return slug || "untitled";
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function parseScalar(value: string): unknown {
	const trimmed = value.trim();
	if (trimmed === "null") return null;
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed);
	if (trimmed.startsWith("[") || trimmed.startsWith("\"")) {
		try { return JSON.parse(trimmed); } catch { /* keep the raw value */ }
	}
	return trimmed.replace(/^['"]|['"]$/g, "");
}

function parseMarkdownDocument(raw: string): { frontmatter: Record<string, unknown>; body: string } {
	if (!raw.startsWith("---\n")) return { frontmatter: {}, body: raw.trim() };
	const end = raw.indexOf("\n---", 4);
	if (end < 0) return { frontmatter: {}, body: raw.trim() };
	const frontmatter: Record<string, unknown> = {};
	for (const line of raw.slice(4, end).split("\n")) {
		const separator = line.indexOf(":");
		if (separator < 0) continue;
		frontmatter[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1));
	}
	return { frontmatter, body: raw.slice(end + 4).replace(/^\n+/, "").trim() };
}

function stringValue(frontmatter: Record<string, unknown>, key: string, fallback = ""): string {
	const value = frontmatter[key];
	return typeof value === "string" ? value : fallback;
}

function numberValue(frontmatter: Record<string, unknown>, key: string, fallback: number): number {
	const value = frontmatter[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function tagsValue(frontmatter: Record<string, unknown>): string[] {
	const value = frontmatter.tags;
	if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
	if (typeof value === "string") return value.split(",").map(tag => tag.trim()).filter(Boolean);
	return [];
}

function quote(value: string): string {
	return JSON.stringify(value);
}

function serializeRecord(record: CollectionRecord): string {
	const common = [
		"---",
		`rnomoType: ${record.kind}`,
		`id: ${quote(record.id)}`,
		`title: ${quote(record.title)}`,
		`tags: ${JSON.stringify(record.tags)}`,
		`link: ${quote(record.link)}`,
		`createdAt: ${quote(record.createdAt)}`,
		`updatedAt: ${quote(record.updatedAt)}`,
	];
	if (record.kind === "progress") {
		common.push(
			`status: ${record.status}`,
			`current: ${record.current}`,
			`total: ${record.total === null ? "null" : record.total}`,
			`unit: ${quote(record.unit)}`,
		);
	} else if (record.kind === "review") {
		common.push(`category: ${quote(record.category)}`, `rating: ${record.rating}`);
		common.push(`status: ${record.status}`);
	} else {
		common.push(
			`category: ${quote(record.category)}`, `location: ${quote(record.location)}`,
			`quantity: ${record.quantity}`, `unit: ${quote(record.unit)}`,
			`status: ${record.status}`, `purchaseDate: ${quote(record.purchaseDate)}`,
			`expiryDate: ${quote(record.expiryDate)}`,
		);
	}
	return [...common, "---", "", record.note.trim(), ""].join("\n");
}

function asProgress(file: TFile, frontmatter: Record<string, unknown>, body: string): ProgressRecord | null {
	const title = stringValue(frontmatter, "title", file.basename).trim();
	if (!title) return null;
	const status = stringValue(frontmatter, "status", "planned");
	return {
		kind: "progress",
		id: stringValue(frontmatter, "id", file.path),
		title,
		status: ["planned", "active", "paused", "done"].includes(status) ? status as ProgressStatus : "planned",
		current: Math.max(0, numberValue(frontmatter, "current", 0)),
		total: frontmatter.total === null ? null : Math.max(0, numberValue(frontmatter, "total", 0)),
		unit: stringValue(frontmatter, "unit"),
		tags: tagsValue(frontmatter),
		link: stringValue(frontmatter, "link"),
		note: body,
		createdAt: stringValue(frontmatter, "createdAt", new Date(file.stat.ctime).toISOString()),
		updatedAt: stringValue(frontmatter, "updatedAt", new Date(file.stat.mtime).toISOString()),
		path: file.path,
	};
}

function asReview(file: TFile, frontmatter: Record<string, unknown>, body: string): ReviewRecord | null {
	const title = stringValue(frontmatter, "title", file.basename).trim();
	if (!title) return null;
	return {
		kind: "review",
		id: stringValue(frontmatter, "id", file.path),
		title,
		category: stringValue(frontmatter, "category"),
		status: ["planned", "in-progress", "done"].includes(stringValue(frontmatter, "status", "planned"))
			? stringValue(frontmatter, "status", "planned") as ReviewStatus : "planned",
		rating: Math.min(5, Math.max(0, numberValue(frontmatter, "rating", 0))),
		tags: tagsValue(frontmatter),
		link: stringValue(frontmatter, "link"),
		note: body,
		createdAt: stringValue(frontmatter, "createdAt", new Date(file.stat.ctime).toISOString()),
		updatedAt: stringValue(frontmatter, "updatedAt", new Date(file.stat.mtime).toISOString()),
		path: file.path,
	};
}

function asInventory(file: TFile, frontmatter: Record<string, unknown>, body: string): InventoryRecord | null {
	const title = stringValue(frontmatter, "title", file.basename).trim();
	if (!title) return null;
	const status = stringValue(frontmatter, "status", "available");
	return {
		kind: "inventory", id: stringValue(frontmatter, "id", file.path), title,
		category: stringValue(frontmatter, "category"), location: stringValue(frontmatter, "location"),
		quantity: Math.max(0, numberValue(frontmatter, "quantity", 1)), unit: stringValue(frontmatter, "unit"),
		status: ["available", "low", "used-up", "archived"].includes(status) ? status as InventoryStatus : "available",
		purchaseDate: stringValue(frontmatter, "purchaseDate"), expiryDate: stringValue(frontmatter, "expiryDate"),
		tags: tagsValue(frontmatter), link: stringValue(frontmatter, "link"), note: body,
		createdAt: stringValue(frontmatter, "createdAt", new Date(file.stat.ctime).toISOString()),
		updatedAt: stringValue(frontmatter, "updatedAt", new Date(file.stat.mtime).toISOString()), path: file.path,
	};
}

export class CollectionRecordService {
	constructor(private readonly vault: Vault) {}

	async list(kind: CollectionKind): Promise<CollectionRecord[]> {
		const folder = folderFor(kind) + "/";
		const files = this.vault.getMarkdownFiles().filter(file => file.path.startsWith(folder));
		const records: CollectionRecord[] = [];
		for (const file of files) {
			try {
				const parsed = parseMarkdownDocument(await this.vault.read(file));
				if (parsed.frontmatter.rnomoType !== kind) continue;
				const record = kind === "progress"
					? asProgress(file, parsed.frontmatter, parsed.body)
					: kind === "review" ? asReview(file, parsed.frontmatter, parsed.body)
						: asInventory(file, parsed.frontmatter, parsed.body);
				if (record !== null) records.push(record);
			} catch {
				// One malformed record should not hide the remaining collection.
			}
		}
		// Keep the collection order stable when a record is edited or its progress changes.
		// Updated timestamps are metadata, not a reason to move a card in the list.
		return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.path.localeCompare(b.path));
	}

	async createProgress(input: ProgressInput): Promise<ProgressRecord> {
		const now = nowIso();
		const record: ProgressRecord = {
			kind: "progress", id: this.createId(), ...input,
			current: Math.max(0, input.current), total: input.total === null ? null : Math.max(0, input.total),
			createdAt: now, updatedAt: now, path: "",
		};
		record.path = await this.createFile(record);
		return record;
	}

	async createReview(input: ReviewInput): Promise<ReviewRecord> {
		const now = nowIso();
		const record: ReviewRecord = {
			kind: "review", id: this.createId(), ...input,
			rating: Math.min(5, Math.max(0, input.rating)),
			createdAt: now, updatedAt: now, path: "",
		};
		record.path = await this.createFile(record);
		return record;
	}

	async createInventory(input: InventoryInput): Promise<InventoryRecord> {
		const now = nowIso();
		const record: InventoryRecord = {
			kind: "inventory", id: this.createId(), ...input,
			quantity: Math.max(0, input.quantity), createdAt: now, updatedAt: now, path: "",
		};
		record.path = await this.createFile(record);
		return record;
	}

	async update(record: CollectionRecord, input: ProgressInput | ReviewInput | InventoryInput): Promise<CollectionRecord> {
		const updated = { ...record, ...input, updatedAt: nowIso() } as CollectionRecord;
		await this.vault.modify(this.requireFile(record.path), serializeRecord(updated));
		return { ...updated, path: record.path } as CollectionRecord;
	}

	async remove(record: CollectionRecord): Promise<void> {
		await this.vault.delete(this.requireFile(record.path));
	}

	private async createFile(record: CollectionRecord): Promise<string> {
		const folder = folderFor(record.kind);
		await this.ensureFolder(folder);
		const base = `${slugify(record.title)}-${record.id.slice(-6)}`;
		let path = normalizePath(`${folder}/${base}.md`);
		let suffix = 2;
		while (this.vault.getAbstractFileByPath(path) !== null) path = normalizePath(`${folder}/${base}-${suffix++}.md`);
		await this.vault.create(path, serializeRecord(record));
		return path;
	}

	private async ensureFolder(path: string): Promise<void> {
		let current = "";
		for (const part of normalizePath(path).split("/")) {
			current = current ? `${current}/${part}` : part;
			if (this.vault.getAbstractFileByPath(current) === null) await this.vault.createFolder(current);
		}
	}

	private requireFile(path: string): TFile {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`Collection record is unavailable: ${path}`);
		return file;
	}

	private createId(): string {
		return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}
}
