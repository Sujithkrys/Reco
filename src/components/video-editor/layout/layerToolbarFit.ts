/** Width of one toolbar icon button (h-7 w-7) plus the row's gap-1.5. */
export const TOOLBAR_BUTTON_SLOT_PX = 34;
/** The divider before the group: w-px with mx-1, plus the row gap. */
export const TOOLBAR_DIVIDER_PX = 15;

export interface FittableToolbarItem {
	key: string;
	/** Plain actions can move into the "more" menu; popovers cannot. */
	kind: "action" | "popover";
}

export interface ToolbarFit<T> {
	visible: T[];
	/** Plain actions shown in the "more" menu. */
	overflow: T[];
	/** Popovers that did not fit; the settings panel still offers them. */
	hidden: T[];
}

/**
 * Fit the toolbar into the free space next to the existing buttons without ever
 * reaching the playback controls. Plain actions spill into a "more" menu first
 * (from the end); popovers that still don't fit are left to the settings panel.
 */
export function fitToolbarItems<T extends FittableToolbarItem>(
	items: T[],
	availableWidthPx: number,
): ToolbarFit<T> {
	const slots = Math.floor((availableWidthPx - TOOLBAR_DIVIDER_PX) / TOOLBAR_BUTTON_SLOT_PX);
	if (items.length === 0 || slots <= 0) return { visible: [], overflow: [], hidden: items };
	if (items.length <= slots) return { visible: items, overflow: [], hidden: [] };

	// One slot goes to the "more" button.
	const buttonSlots = slots - 1;
	const popovers = items.filter((item) => item.kind === "popover");
	const actions = items.filter((item) => item.kind === "action");
	const shownPopovers = popovers.slice(0, Math.max(0, buttonSlots));
	const actionSlots = Math.max(0, buttonSlots - shownPopovers.length);
	const shownActions = actions.slice(0, actionSlots);
	const shown = new Set([...shownPopovers, ...shownActions]);

	const overflow = actions.filter((item) => !shown.has(item));
	const hidden = popovers.filter((item) => !shown.has(item));
	// Without anything to put in the menu, the "more" slot can hold a popover instead.
	if (overflow.length === 0 && hidden.length > 0) {
		shown.add(hidden.shift() as T);
	}
	return {
		visible: items.filter((item) => shown.has(item)),
		overflow,
		hidden,
	};
}
