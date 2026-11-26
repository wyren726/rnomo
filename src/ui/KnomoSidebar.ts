import { setIcon } from "obsidian";

import { t } from "../i18n";
import { buildTagTree } from "../utils/tagTree";
import type { TagSummary, TagTreeNode } from "../utils/tagTree";
import { getSidebarNavItems, TRASH_NAV_ITEM } from "./viewNavigation";
import type { SidebarNav, SidebarNavItem } from "./viewNavigation";

export const SIDEBAR_MIN_WIDTH = 210;
export const SIDEBAR_MAX_WIDTH = 300;

interface KnomoSidebarOptions {
	sidebarMinWidth: number;
	sidebarMaxWidth: number;
	timeBuoyEnabled?: boolean;
	navOrder?: readonly string[];
	tagOrder?: readonly string[];
	onNavOrderChanged?: (order: string[]) => void;
	onTagOrderChanged?: (order: string[]) => void;
	createHiddenText: (container: HTMLElement, id: string, text: string) => string;
	createIconButton: (
		container: HTMLElement,
		icon: string,
		ariaLabel: string,
		cls: string,
		action: string,
		showTooltip?: boolean,
	) => HTMLButtonElement;
}

export interface KnomoSidebarElements {
	statsEl: HTMLElement;
	allTagsEl: HTMLElement;
	trashCountEl: HTMLElement;
	resizerEl: HTMLElement;
}

export interface RenderSidebarTagsOptions {
	activeTagKey: string | null;
	expandedTagGroups: ReadonlySet<string>;
	emptyText: string;
	tagOrder?: readonly string[];
	onTagOrderChanged?: (order: string[]) => void;
}

export interface SidebarDragState {
	pointerId: number;
	startX: number;
	startWidth: number;
}

export function renderKnomoSidebar(sidebar: HTMLElement, options: KnomoSidebarOptions): KnomoSidebarElements {
	const header = sidebar.createDiv({ cls: "knomo-sidebar-header" });
	const brand = header.createDiv({ cls: "knomo-brand" });
	brand.createDiv({ cls: "knomo-brand-title", text: "Rnomo" });
	brand.createDiv({ cls: "knomo-brand-subtitle", text: t("sidebar.subtitle") });
	const actions = header.createDiv({ cls: "knomo-sidebar-actions" });
	options.createIconButton(actions, "refresh-cw", t("sidebar.refresh"), "knomo-sidebar-action", "refresh");
	options.createIconButton(actions, "panel-left-close", t("sidebar.hide"), "knomo-sidebar-action knomo-desktop-only", "collapse-sidebar");

	options.createIconButton(actions, "x", t("sidebar.hide"), "knomo-sidebar-action knomo-drawer-close", "close-drawer");

	const statsLabelId = options.createHiddenText(sidebar, "stats-label", t("sidebar.stats"));
	const statsEl = sidebar.createDiv({ cls: "knomo-sidebar-stats", attr: { "aria-labelledby": statsLabelId, tabindex: "-1" } });

	const navLabelId = options.createHiddenText(sidebar, "nav-label", t("sidebar.scope"));
	const nav = sidebar.createEl("nav", {
		cls: "knomo-nav",
		attr: { "aria-labelledby": navLabelId },
	});
	for (const item of orderItems(getSidebarNavItems(options.timeBuoyEnabled === true), options.navOrder)) {
		renderSidebarNavButton(nav, item, options.onNavOrderChanged);
	}

	const allTagSection = sidebar.createDiv({ cls: "knomo-tag-section" });
	allTagSection.createDiv({ cls: "knomo-section-label", text: t("sidebar.allTags") });
	const allTagsEl = allTagSection.createDiv({ cls: "knomo-tag-list" });

	const trashSection = sidebar.createDiv({ cls: "knomo-trash-section" });
	const trashButton = renderSidebarNavButton(trashSection, TRASH_NAV_ITEM);
	trashButton.addClass("knomo-trash-nav-button");
	const trashCountEl = trashButton.createSpan({ cls: "knomo-trash-count" });

	const resizerLabelId = options.createHiddenText(sidebar, "resizer-label", t("sidebar.resize"));
	const resizerEl = sidebar.createDiv({
		cls: "knomo-sidebar-resizer knomo-desktop-only",
		attr: {
			role: "separator",
			"aria-orientation": "vertical",
			"aria-labelledby": resizerLabelId,
			"aria-valuemin": String(options.sidebarMinWidth),
			"aria-valuemax": String(options.sidebarMaxWidth),
			tabindex: "0",
		},
	});

	return {
		statsEl,
		allTagsEl,
		trashCountEl,
		resizerEl,
	};
}

export function clampSidebarWidth(width: number): number {
	return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export function getSidebarDragWidth(drag: SidebarDragState, clientX: number): number {
	return drag.startWidth + clientX - drag.startX;
}

export function renderSidebarStat(container: HTMLElement, value: string, label: string): { value: HTMLElement; label: HTMLElement } {
	const item = container.createDiv({ cls: "knomo-stat" });
	return {
		value: item.createDiv({ cls: "knomo-stat-value", text: value }),
		label: item.createDiv({ cls: "knomo-stat-label", text: label }),
	};
}

const sidebarStats = new WeakMap<HTMLElement, {
	items: Array<{ value: HTMLElement; label: HTMLElement }>;
	updating: HTMLElement;
}>();

export function renderSidebarStats(container: HTMLElement, metrics: readonly [string, string][], updating: boolean): void {
	let rendered = sidebarStats.get(container);
	if (!rendered || !container.contains(rendered.updating)) {
		container.empty();
		rendered = {
			items: metrics.map(([value, label]) => renderSidebarStat(container, value, label)),
			updating: container.createDiv({ cls: "knomo-sidebar-updating" }),
		};
		sidebarStats.set(container, rendered);
	}
	const items = rendered.items;
	metrics.forEach(([value, label], index) => {
		const item = items[index];
		if (item.value.getText() !== value) item.value.setText(value);
		if (item.label.getText() !== label) item.label.setText(label);
	});
	rendered.updating.hidden = !updating;
	if (updating) rendered.updating.setText(t("status.updating"));
}

export function renderSidebarTags(container: HTMLElement | null, tags: TagSummary[], options: RenderSidebarTagsOptions): void {
	if (container === null) {
		return;
	}
	container.empty();
	const tree = buildTagTree(tags);
	if (tree.length === 0) {
		container.createDiv({ cls: "knomo-muted-text", text: options.emptyText });
		return;
	}
	const notifyTagOrder = (): void => {
		options.onTagOrderChanged?.(Array.from(container.querySelectorAll<HTMLElement>("[data-sort-key]")).map(node => node.getAttribute("data-sort-key") ?? "").filter(Boolean));
	};
	for (const tag of orderItems(tree, options.tagOrder, tag => tag.key)) {
		renderTagTreeNode(container, tag, options, notifyTagOrder, true);
	}
}

export function syncSidebarTagGroupExpanded(node: HTMLElement, toggle: HTMLElement, expanded: boolean): void {
	node.toggleClass("is-collapsed", !expanded);
	toggle.setAttr("aria-expanded", expanded ? "true" : "false");
	toggle.setAttr("aria-label", expanded ? t("tags.collapseGroup") : t("tags.expandGroup"));
}

export function syncSidebarNavButtons(rootEl: HTMLElement | null, activeNav: SidebarNav): void {
	rootEl?.findAll("[data-nav]").forEach((element) => {
		const active = element.getAttr("data-nav") === activeNav;
		element.toggleClass("is-active", active);
		element.setAttr("aria-pressed", active ? "true" : "false");
	});
}

function clearDropPreview(container: HTMLElement | null): void {
	if (container === null || typeof container.querySelectorAll !== "function") return;
	container.querySelectorAll<HTMLElement>(".is-drop-before, .is-drop-after").forEach((element) => {
		element.removeClass("is-drop-before");
		element.removeClass("is-drop-after");
	});
}

function setDropPreview(target: HTMLElement, insertBefore: boolean): void {
	clearDropPreview(target.parentElement);
	target.addClass(insertBefore ? "is-drop-before" : "is-drop-after");
}

function renderSidebarNavButton(container: HTMLElement, item: SidebarNavItem, onOrderChanged?: (order: string[]) => void): HTMLButtonElement {
	const button = container.createEl("button", {
		cls: "knomo-nav-button",
		attr: {
			type: "button",
			"aria-pressed": "false",
			"data-nav": item.nav,
		},
	});
	if (onOrderChanged && typeof button.addEventListener === "function") {
		button.draggable = true;
		registerPointerSort(button, item.nav, onOrderChanged, () => Array.from(button.parentElement?.querySelectorAll<HTMLElement>("[data-nav]") ?? []));
		button.addEventListener("dragstart", event => {
			event.dataTransfer?.setData("text/plain", item.nav);
			button.addClass("is-dragging");
		});
		button.addEventListener("dragend", () => {
			button.removeClass("is-dragging");
			clearDropPreview(button.parentElement);
		});
		button.addEventListener("dragover", event => {
			event.preventDefault();
			const rect = button.getBoundingClientRect();
			setDropPreview(button, event.clientY < rect.top + rect.height / 2);
		});
		button.addEventListener("drop", event => {
			event.preventDefault();
			const rect = button.getBoundingClientRect();
			const insertBefore = event.clientY < rect.top + rect.height / 2;
			const dragged = event.dataTransfer?.getData("text/plain");
			clearDropPreview(button.parentElement);
			if (!dragged || dragged === item.nav) return;
			const buttons = Array.from(button.parentElement?.querySelectorAll<HTMLElement>("[data-nav]") ?? []);
			const source = buttons.find(candidate => candidate.getAttribute("data-nav") === dragged);
			if (!source) return;
			button.parentElement?.insertBefore(source, insertBefore ? button : button.nextSibling);
			const reordered = Array.from(button.parentElement?.querySelectorAll<HTMLElement>("[data-nav]") ?? []);
			onOrderChanged(reordered.map(candidate => candidate.getAttribute("data-nav") ?? "").filter(Boolean));
		});
	}
	setIcon(button.createSpan({ cls: "knomo-button-icon" }), item.icon);
	button.createSpan({ cls: "knomo-button-label", text: item.label });
	return button;
}

function renderTagTreeNode(container: HTMLElement, tag: TagTreeNode, options: RenderSidebarTagsOptions, onOrderChanged?: (order: string[]) => void, sortable = false): void {
	const collapsed = tag.children.length > 0 && !options.expandedTagGroups.has(tag.key);
	const node = container.createDiv({ cls: collapsed ? "knomo-tag-node is-collapsed" : "knomo-tag-node" });
	node.setAttr("data-sort-key", tag.key);
	if (sortable && onOrderChanged && typeof node.addEventListener === "function") {
		node.draggable = true;
		registerPointerSort(node, tag.key, onOrderChanged, () => Array.from(node.parentElement?.children ?? []).filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement && candidate.hasAttribute("data-sort-key")));
		node.addEventListener("dragstart", event => {
			event.dataTransfer?.setData("text/plain", tag.key);
			node.addClass("is-dragging");
		});
		node.addEventListener("dragend", () => {
			node.removeClass("is-dragging");
			clearDropPreview(node.parentElement);
		});
		node.addEventListener("dragover", event => {
			event.preventDefault();
			const rect = node.getBoundingClientRect();
			setDropPreview(node, event.clientY < rect.top + rect.height / 2);
		});
		node.addEventListener("drop", event => {
			event.preventDefault();
			const rect = node.getBoundingClientRect();
			const insertBefore = event.clientY < rect.top + rect.height / 2;
			const dragged = event.dataTransfer?.getData("text/plain");
			clearDropPreview(node.parentElement);
			if (!dragged || dragged === tag.key) return;
			const siblings = Array.from(node.parentElement?.children ?? []).filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement && candidate.hasAttribute("data-sort-key"));
			const source = siblings.find(candidate => candidate.getAttribute("data-sort-key") === dragged);
			if (!source) return;
			node.parentElement?.insertBefore(source, insertBefore ? node : node.nextSibling);
			const reordered = Array.from(node.parentElement?.children ?? []).filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement && candidate.hasAttribute("data-sort-key"));
			onOrderChanged(reordered.map(candidate => candidate.getAttribute("data-sort-key") ?? "").filter(Boolean));
		});
	}
	const row = node.createDiv({ cls: "knomo-tag-row" });
	const button = row.createEl("button", {
		cls: options.activeTagKey === tag.key ? "knomo-tag-nav is-active" : "knomo-tag-nav",
		attr: {
			type: "button",
			"data-tag": tag.name,
			"data-tag-key": tag.key,
			"aria-pressed": options.activeTagKey === tag.key ? "true" : "false",
		},
	});
	button.createSpan({ cls: "knomo-tag-name", text: tag.label });
	if (tag.children.length > 0) {
		const toggle = row.createEl("button", {
			cls: "knomo-tag-toggle",
			attr: {
				type: "button",
				"aria-label": collapsed ? t("tags.expandGroup") : t("tags.collapseGroup"),
				"aria-expanded": collapsed ? "false" : "true",
				"data-tag-toggle": tag.key,
			},
		});
		toggle.createSpan({ cls: "knomo-tag-count", text: String(tag.count) });
		const toggleIcon = toggle.createSpan({ cls: "knomo-tag-toggle-icon" });
		setIcon(toggleIcon, "chevron-down");
	} else {
		row.createSpan({ cls: "knomo-tag-count", text: String(tag.count) });
	}
	if (tag.children.length > 0) {
		const children = node.createDiv({ cls: "knomo-tag-children" });
		for (const child of orderItems(tag.children, options.tagOrder, child => child.key)) {
			renderTagTreeNode(children, child, options, onOrderChanged, true);
		}
	}
}

function registerPointerSort(
	element: HTMLElement,
	key: string,
	onOrderChanged: (order: string[]) => void,
	getSiblings: () => HTMLElement[],
): void {
	if (typeof element.addEventListener !== "function") return;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let moved = false;
	let suppressClick = false;
	element.addEventListener("pointerdown", event => {
		if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
		if ((event.target as HTMLElement).closest("[data-tag-toggle]")) return;
		suppressClick = false;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		moved = false;
		element.setPointerCapture?.(event.pointerId);
	});
	element.addEventListener("pointermove", event => {
		if (pointerId !== event.pointerId) return;
		if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) < 8) return;
		moved = true;
		event.preventDefault();
		const target = element.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-nav], [data-sort-key]");
		const siblings = getSiblings();
		const destination = target && siblings.includes(target) ? target : null;
		if (destination === null || destination === element) return;
		const rect = destination.getBoundingClientRect();
		const insertBefore = event.clientY < rect.top + rect.height / 2;
		setDropPreview(destination, insertBefore);
		if (insertBefore) destination.parentElement?.insertBefore(element, destination);
		else destination.parentElement?.insertBefore(element, destination.nextSibling);
		element.addClass("is-dragging");
	});
	const finish = (event: PointerEvent): void => {
		if (pointerId !== event.pointerId) return;
		pointerId = null;
		element.releasePointerCapture?.(event.pointerId);
		if (!moved) return;
		event.preventDefault();
		suppressClick = true;
		element.removeClass("is-dragging");
		clearDropPreview(element.parentElement);
		onOrderChanged(getSiblings().map(sibling => sibling.getAttribute("data-nav") ?? sibling.getAttribute("data-sort-key") ?? "").filter(Boolean));
	};
	element.addEventListener("pointerup", finish);
	element.addEventListener("pointercancel", finish);
	element.addEventListener("click", event => {
		if (!suppressClick) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		suppressClick = false;
	});
}

function orderItems<T>(items: readonly T[], order: readonly string[] | undefined, keyOf: (item: T) => string = (item) => {
		if (typeof item === "object" && item !== null && "nav" in item) return String((item as { nav: string }).nav);
		return String(item);
	}): T[] {
		if (!order || order.length === 0) return [...items];
		const positions = new Map(order.map((key, index) => [key, index]));
		return [...items].sort((left, right) => (positions.get(keyOf(left)) ?? Number.MAX_SAFE_INTEGER) - (positions.get(keyOf(right)) ?? Number.MAX_SAFE_INTEGER));
}
