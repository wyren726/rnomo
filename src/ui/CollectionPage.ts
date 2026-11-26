import { App, Modal, Notice } from "obsidian";

import { t } from "../i18n";
import {
	CollectionRecordService,
	type CollectionKind,
	type CollectionRecord,
	type InventoryInput,
	type InventoryRecord,
	type InventoryStatus,
	type ProgressInput,
	type ProgressRecord,
	type ProgressStatus,
	type ReviewInput,
	type ReviewRecord,
	type ReviewStatus,
} from "../services/CollectionRecordService";
import { showKnomoConfirmModal } from "./KnomoConfirmModal";

interface CollectionPageOptions {
	app: App;
	container: HTMLElement;
	kind: "progress" | "review" | "inventory";
	service: CollectionRecordService;
	onChanged: () => void;
}

interface FieldRefs {
	title: HTMLInputElement;
	category?: HTMLInputElement;
	location?: HTMLInputElement;
	status: HTMLSelectElement;
	current?: HTMLInputElement;
	total?: HTMLInputElement;
	unit?: HTMLInputElement;
	quantity?: HTMLInputElement;
	purchaseDate?: HTMLInputElement;
	expiryDate?: HTMLInputElement;
	rating?: HTMLInputElement;
	tags: HTMLInputElement;
	link: HTMLInputElement;
	note: HTMLTextAreaElement;
}

function formatDate(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function tagsText(tags: readonly string[]): string {
	return tags.map(tag => `#${tag}`).join(" ");
}

function progressRatio(record: ProgressRecord): number {
	if (record.status === "done") return 1;
	if (record.total === null || record.total <= 0) return 0;
	return Math.min(1, Math.max(0, record.current / record.total));
}

function setText(element: HTMLElement, text: string): void {
	element.textContent = text;
}

export function isCollectionNav(value: string): value is "progress" | "reviews" | "inventory" {
	return value === "progress" || value === "reviews" || value === "inventory";
}

export function renderCollectionPage(options: CollectionPageOptions): void {
	const { container, kind } = options;
	container.empty();
	container.addClass("rnomo-collection-page");
	const page = container.createDiv({ cls: "rnomo-collection-shell" });
	const header = page.createDiv({ cls: "rnomo-collection-header" });
	const heading = header.createDiv({ cls: "rnomo-collection-heading" });
	const inventory = kind === "inventory";
	setText(heading.createEl("h2"), kind === "progress" ? t("collection.progress.title") : inventory ? t("collection.inventory.title") : t("collection.review.title"));
	setText(heading.createDiv({ cls: "rnomo-collection-subtitle" }), kind === "progress" ? t("collection.progress.desc") : inventory ? t("collection.inventory.desc") : t("collection.review.desc"));
	const add = header.createEl("button", { cls: "rnomo-collection-add", attr: { type: "button" } });
	add.textContent = kind === "progress" ? t("collection.progress.add") : inventory ? t("collection.inventory.add") : t("collection.review.add");
	add.addEventListener("click", () => new CollectionRecordModal(options.app, options.service, kind, null, options.onChanged).open());

	const list = page.createDiv({ cls: "rnomo-collection-list", attr: { "aria-live": "polite" } });
	setText(list.createDiv({ cls: "rnomo-collection-loading" }), t("collection.loading"));
	void options.service.list(kind === "progress" ? "progress" : inventory ? "inventory" : "review").then(records => {
		if (!container.isConnected) return;
		list.empty();
		if (records.length === 0) {
			const empty = list.createDiv({ cls: "rnomo-collection-empty" });
			setText(empty.createDiv({ cls: "rnomo-collection-empty-title" }), t("collection.empty"));
			setText(empty.createDiv({ cls: "rnomo-collection-empty-desc" }), kind === "progress" ? t("collection.progress.empty") : inventory ? t("collection.inventory.empty") : t("collection.review.empty"));
			const emptyAdd = empty.createEl("button", { cls: "rnomo-collection-empty-action", attr: { type: "button" } });
			emptyAdd.textContent = kind === "progress" ? t("collection.progress.add") : inventory ? t("collection.inventory.add") : t("collection.review.add");
			emptyAdd.addEventListener("click", () => new CollectionRecordModal(options.app, options.service, kind, null, options.onChanged).open());
			return;
		}
		for (const record of records) renderRecordCard(list, options, record);
	}).catch(error => {
		if (!container.isConnected) return;
		list.empty();
		setText(list.createDiv({ cls: "rnomo-collection-error" }), `${t("collection.error")} ${String(error)}`);
	});
}

function renderRecordCard(container: HTMLElement, options: CollectionPageOptions, record: CollectionRecord): void {
	const card = container.createDiv({ cls: "rnomo-collection-card" });
	const top = card.createDiv({ cls: "rnomo-collection-card-top" });
	const title = top.createDiv({ cls: "rnomo-collection-card-title" });
	setText(title, record.title);
	const actions = top.createDiv({ cls: "rnomo-collection-card-actions" });
	const edit = actions.createEl("button", { cls: "rnomo-collection-card-action", attr: { type: "button" } });
	edit.textContent = t("collection.edit");
	edit.addEventListener("click", () => new CollectionRecordModal(options.app, options.service, options.kind, record, options.onChanged).open());
	const remove = actions.createEl("button", { cls: "rnomo-collection-card-action is-danger", attr: { type: "button" } });
	remove.textContent = t("collection.delete");
	remove.addEventListener("click", () => {
		void (async () => {
			const confirmed = await showKnomoConfirmModal(options.app, {
				title: t("collection.delete"), message: t("collection.deleteConfirm"),
				confirmLabel: t("collection.delete"), danger: true,
			});
			if (!confirmed) return;
			try {
				await options.service.remove(record);
				new Notice(t("collection.deleted"));
				options.onChanged();
			} catch (error) {
				new Notice(`${t("collection.error")} ${String(error)}`);
			}
		})();
	});

	if (record.kind === "progress") {
		const meta = card.createDiv({ cls: "rnomo-collection-card-meta" });
		setText(meta.createSpan({ cls: "rnomo-collection-status" }), t(`collection.progress.status.${record.status}`));
		setText(meta.createSpan(), `${record.current}${record.total === null ? "" : ` / ${record.total}`} ${record.unit}`.trim());
		const progress = card.createDiv({ cls: "rnomo-collection-progress-track" });
		progress.createDiv({ cls: "rnomo-collection-progress-fill" }).style.width = `${Math.round(progressRatio(record) * 100)}%`;
		setText(card.createDiv({ cls: "rnomo-collection-card-note" }), record.note || t("collection.noNote"));
		if (record.tags.length > 0) setText(card.createDiv({ cls: "rnomo-collection-tags" }), tagsText(record.tags));
	} else if (record.kind === "review") {
		const meta = card.createDiv({ cls: "rnomo-collection-card-meta" });
		setText(meta.createSpan({ cls: "rnomo-collection-stars" }), `${"★".repeat(Math.round(record.rating))}${"☆".repeat(5 - Math.round(record.rating))}`);
		setText(meta.createSpan({ cls: "rnomo-collection-status" }), t(`collection.review.status.${record.status === "in-progress" ? "inProgress" : record.status}`));
		if (record.category) setText(meta.createSpan(), record.category);
		setText(meta.createSpan(), formatDate(record.updatedAt));
		setText(card.createDiv({ cls: "rnomo-collection-card-note" }), record.note || t("collection.noNote"));
		if (record.tags.length > 0) setText(card.createDiv({ cls: "rnomo-collection-tags" }), tagsText(record.tags));
	} else {
		const meta = card.createDiv({ cls: "rnomo-collection-card-meta" });
		setText(meta.createSpan({ cls: "rnomo-collection-status" }), t(`collection.inventory.status.${record.status === "used-up" ? "usedUp" : record.status}`));
		if (record.category) setText(meta.createSpan(), record.category);
		if (record.location) setText(meta.createSpan(), `${t("collection.inventory.location")}: ${record.location}`);
		setText(meta.createSpan(), `${record.quantity} ${record.unit}`.trim());
		if (record.expiryDate) setText(meta.createSpan(), `${t("collection.inventory.expiry")}: ${record.expiryDate}`);
		setText(card.createDiv({ cls: "rnomo-collection-card-note" }), record.note || t("collection.noNote"));
		if (record.tags.length > 0) setText(card.createDiv({ cls: "rnomo-collection-tags" }), tagsText(record.tags));
	}
	if (record.link) {
		const link = card.createEl("a", { cls: "rnomo-collection-link", text: record.link, href: record.link });
		link.target = "_blank";
		link.rel = "noreferrer";
	}
}

class CollectionRecordModal extends Modal {
	private readonly kind: CollectionKind;
	private readonly service: CollectionRecordService;
	private readonly existing: CollectionRecord | null;
	private readonly onChanged: () => void;

	constructor(app: App, service: CollectionRecordService, kind: CollectionKind, existing: CollectionRecord | null, onChanged: () => void) {
		super(app);
		this.kind = kind;
		this.service = service;
		this.existing = existing;
		this.onChanged = onChanged;
	}

	onOpen(): void {
		this.modalEl.addClass("rnomo-collection-modal");
		this.titleEl.setText(this.existing ? t("collection.edit") : this.kind === "progress" ? t("collection.progress.add") : this.kind === "inventory" ? t("collection.inventory.add") : t("collection.review.add"));
		this.contentEl.empty();
		const form = this.contentEl.createEl("form", { cls: "rnomo-collection-form" });
		const title = this.addTextField(form, t("collection.field.title"), this.existing?.title ?? "");
		let category: HTMLInputElement | undefined;
		let current: HTMLInputElement | undefined;
		let total: HTMLInputElement | undefined;
		let unit: HTMLInputElement | undefined;
		let rating: HTMLInputElement | undefined;
		if (this.kind === "progress") {
			current = this.addNumberField(form, t("collection.field.current"), (this.existing?.kind === "progress" ? this.existing.current : 0), 0);
			total = this.addNumberField(form, t("collection.field.total"), this.existing?.kind === "progress" && this.existing.total !== null ? this.existing.total : undefined, 0);
			unit = this.addTextField(form, t("collection.field.unit"), this.existing?.kind === "progress" ? this.existing.unit : "");
		} else if (this.kind === "review") {
			category = this.addTextField(form, t("collection.field.category"), this.existing?.kind === "review" ? this.existing.category : "");
			rating = this.addNumberField(form, t("collection.field.rating"), this.existing?.kind === "review" ? this.existing.rating : 0, 0, 5, 0.5);
		} else {
			category = this.addTextField(form, t("collection.field.category"), this.existing?.kind === "inventory" ? this.existing.category : "");
			const location = this.addTextField(form, t("collection.field.location"), this.existing?.kind === "inventory" ? this.existing.location : "");
			const quantity = this.addNumberField(form, t("collection.field.quantity"), this.existing?.kind === "inventory" ? this.existing.quantity : 1, 0);
			const unit = this.addTextField(form, t("collection.field.unit"), this.existing?.kind === "inventory" ? this.existing.unit : "");
			const purchaseDate = this.addTextField(form, t("collection.field.purchaseDate"), this.existing?.kind === "inventory" ? this.existing.purchaseDate : "");
			const expiryDate = this.addTextField(form, t("collection.field.expiryDate"), this.existing?.kind === "inventory" ? this.existing.expiryDate : "");
			category.dataset.inventory = "category"; location.dataset.inventory = "location"; quantity.dataset.inventory = "quantity";
			unit.dataset.inventory = "unit"; purchaseDate.dataset.inventory = "purchaseDate"; expiryDate.dataset.inventory = "expiryDate";
		}
		const status = this.addSelectField(form, t("collection.field.status"), this.kind === "progress" ? [
			["planned", t("collection.progress.status.planned")], ["active", t("collection.progress.status.active")],
			["paused", t("collection.progress.status.paused")], ["done", t("collection.progress.status.done")],
		] : this.kind === "review" ? [["planned", t("collection.review.status.planned")], ["in-progress", t("collection.review.status.inProgress")], ["done", t("collection.review.status.done")]] : [["available", t("collection.inventory.status.available")], ["low", t("collection.inventory.status.low")], ["used-up", t("collection.inventory.status.usedUp")], ["archived", t("collection.inventory.status.archived")]], this.existing?.status ?? (this.kind === "inventory" ? "available" : "planned"));
		const tags = this.addTextField(form, t("collection.field.tags"), this.existing?.tags.join(", ") ?? "");
		const link = this.addTextField(form, t("collection.field.link"), this.existing?.link ?? "");
		const note = this.addTextAreaField(form, t("collection.field.note"), this.existing?.note ?? "");
		const actions = form.createDiv({ cls: "rnomo-collection-form-actions" });
		const cancel = actions.createEl("button", { type: "button", text: t("collection.cancel") });
		cancel.addEventListener("click", () => this.close());
		const save = actions.createEl("button", { cls: "mod-cta", type: "submit", text: t("collection.save") });
		form.addEventListener("submit", event => {
			event.preventDefault();
			void this.save({ title, category, current, total, unit, rating, status, tags, link, note, save });
		});
		title.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(refs: FieldRefs & { save: HTMLButtonElement }): Promise<void> {
		const title = refs.title.value.trim();
		if (!title) {
			new Notice(t("collection.titleRequired"));
			refs.title.focus();
			return;
		}
		refs.save.disabled = true;
		try {
			const tags = refs.tags.value.split(",").map(tag => tag.trim().replace(/^#/, "")).filter(Boolean);
			if (this.kind === "progress") {
				const input: ProgressInput = {
					title, status: refs.status.value as ProgressStatus, current: Number(refs.current?.value ?? 0) || 0,
					total: refs.total?.value.trim() ? Number(refs.total.value) || 0 : null,
					unit: refs.unit?.value.trim() ?? "", tags, link: refs.link.value.trim(), note: refs.note.value,
				};
				if (this.existing?.kind === "progress") await this.service.update(this.existing, input);
				else await this.service.createProgress(input);
			} else if (this.kind === "review") {
				const input: ReviewInput = {
					title, category: refs.category?.value.trim() ?? "", status: refs.status.value as ReviewStatus, rating: Number(refs.rating?.value ?? 0) || 0,
					tags, link: refs.link.value.trim(), note: refs.note.value,
				};
				if (this.existing?.kind === "review") await this.service.update(this.existing, input);
				else await this.service.createReview(input);
			} else {
				const value = (key: string): string => this.contentEl.querySelector<HTMLInputElement>(`[data-inventory="${key}"]`)?.value.trim() ?? "";
				const input: InventoryInput = {
					title, category: value("category"), location: value("location"), quantity: Number(value("quantity")) || 0,
					unit: value("unit"), status: refs.status.value as InventoryStatus, purchaseDate: value("purchaseDate"),
					expiryDate: value("expiryDate"), tags, link: refs.link.value.trim(), note: refs.note.value,
				};
				if (this.existing?.kind === "inventory") await this.service.update(this.existing, input);
				else await this.service.createInventory(input);
			}
			new Notice(t("collection.saved"));
			this.close();
			this.onChanged();
		} catch (error) {
			new Notice(`${t("collection.error")} ${String(error)}`);
			refs.save.disabled = false;
		}
	}

	private addTextField(parent: HTMLElement, label: string, value: string): HTMLInputElement {
		const wrapper = parent.createDiv({ cls: "rnomo-collection-field" });
		wrapper.createEl("label", { text: label });
		const input = wrapper.createEl("input", { type: "text" });
		input.value = value;
		return input;
	}

	private addNumberField(parent: HTMLElement, label: string, value?: number, min?: number, max?: number, step?: number): HTMLInputElement {
		const input = this.addTextField(parent, label, value === undefined ? "" : String(value));
		input.type = "number";
		if (min !== undefined) input.min = String(min);
		if (max !== undefined) input.max = String(max);
		if (step !== undefined) input.step = String(step);
		return input;
	}

	private addSelectField(parent: HTMLElement, label: string, options: Array<[string, string]>, value: string): HTMLSelectElement {
		const wrapper = parent.createDiv({ cls: "rnomo-collection-field" });
		wrapper.createEl("label", { text: label });
		const select = wrapper.createEl("select");
		for (const [optionValue, optionLabel] of options) select.createEl("option", { value: optionValue, text: optionLabel });
		select.value = value;
		return select;
	}

	private addTextAreaField(parent: HTMLElement, label: string, value: string): HTMLTextAreaElement {
		const wrapper = parent.createDiv({ cls: "rnomo-collection-field" });
		wrapper.createEl("label", { text: label });
		const textarea = wrapper.createEl("textarea");
		textarea.value = value;
		textarea.rows = 6;
		return textarea;
	}
}
