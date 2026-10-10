import { describe, expect, it } from "vitest";
import {
	fitToolbarItems,
	TOOLBAR_BUTTON_SLOT_PX,
	TOOLBAR_DIVIDER_PX,
} from "./layerToolbarFit";

const popover = (key: string) => ({ key, kind: "popover" as const });
const action = (key: string) => ({ key, kind: "action" as const });
const textItems = [
	popover("style"),
	popover("color"),
	popover("background"),
	action("trimStart"),
	action("trimEnd"),
	action("delete"),
];
const widthFor = (slots: number) => TOOLBAR_DIVIDER_PX + slots * TOOLBAR_BUTTON_SLOT_PX;
const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe("layer toolbar fit", () => {
	it("shows every item when there is room", () => {
		const fit = fitToolbarItems(textItems, widthFor(6));
		expect(keys(fit.visible)).toEqual(keys(textItems));
		expect(fit.overflow).toEqual([]);
	});

	it("moves plain actions into the more menu before any popover", () => {
		const fit = fitToolbarItems(textItems, widthFor(5));
		// 4 buttons + the more button.
		expect(keys(fit.visible)).toEqual(["style", "color", "background", "trimStart"]);
		expect(keys(fit.overflow)).toEqual(["trimEnd", "delete"]);
		expect(fit.hidden).toEqual([]);
	});

	it("leaves popovers to the settings panel when even they do not fit", () => {
		const fit = fitToolbarItems(textItems, widthFor(2));
		expect(keys(fit.visible)).toEqual(["style"]);
		expect(keys(fit.overflow)).toEqual(["trimStart", "trimEnd", "delete"]);
		expect(keys(fit.hidden)).toEqual(["color", "background"]);
	});

	it("shows nothing when there is no room at all", () => {
		const fit = fitToolbarItems(textItems, TOOLBAR_DIVIDER_PX + 10);
		expect(fit.visible).toEqual([]);
		expect(fit.overflow).toEqual([]);
	});

	it("never needs more room than it was given", () => {
		for (let slots = 1; slots <= 8; slots++) {
			const fit = fitToolbarItems(textItems, widthFor(slots));
			const usedSlots = fit.visible.length + (fit.overflow.length > 0 ? 1 : 0);
			expect(usedSlots).toBeLessThanOrEqual(slots);
		}
	});
});
