/**
 * What a pointer press in the preview panel must leave alone. Everything else in the panel (the
 * grey space around the canvas, beside, above and below it) counts as empty and clears the
 * selection. React events also bubble out of portals, so popovers, menus and dialogs are matched
 * by their DOM markers here instead of by where they sit in the tree.
 */
export const KEEP_SELECTION_SELECTOR = [
	// Controls
	"button",
	"a[href]",
	"input",
	"select",
	"textarea",
	"label",
	"[role='button']",
	"[role='slider']",
	"[role='switch']",
	"[role='tab']",
	"[role='menuitem']",
	"[contenteditable='true']",
	// Overlays: menus, popovers (the colour picker lives in one), dialogs, tooltips
	"[role='menu']",
	"[role='dialog']",
	"[role='alertdialog']",
	"[role='listbox']",
	"[role='tooltip']",
	"[data-radix-popper-content-wrapper]",
	"[data-radix-portal]",
	"[data-slot='popover-content']",
	"[data-slot='dropdown-menu-content']",
	// Layers and their handles, the caption box, other controls that keep the selection
	"[data-annotation-layers]",
	"[data-preview-keep]",
	// The canvas decides for itself (zoom-focus drag, layer clicks)
	"[data-preview-frame]",
	// The settings panel and the timeline have their own behaviour
	"[data-settings-panel]",
	"[data-timeline-root]",
].join(", ");

interface ClosestLike {
	closest: (selector: string) => unknown;
}

function hasClosest(target: unknown): target is ClosestLike {
	return typeof target === "object" && target !== null && typeof (target as ClosestLike).closest === "function";
}

/** True when a press on `target` is on empty preview space, so every selection should be cleared. */
export function isEmptyPreviewAreaTarget(target: EventTarget | null): boolean {
	if (!hasClosest(target)) return false;
	return target.closest(KEEP_SELECTION_SELECTOR) === null;
}
