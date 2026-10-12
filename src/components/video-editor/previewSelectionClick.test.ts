import { describe, expect, it } from "vitest";
import { isEmptyPreviewAreaTarget, KEEP_SELECTION_SELECTOR } from "./previewSelectionClick";

/** A stand-in element: matches `closest` when any of its ancestors' markers is in the selector. */
function target(...markers: string[]) {
	const parts = KEEP_SELECTION_SELECTOR.split(", ");
	return {
		closest: (selector: string) => (markers.some((m) => selector.split(", ").includes(m) && parts.includes(m)) ? {} : null),
	} as unknown as EventTarget;
}

describe("isEmptyPreviewAreaTarget", () => {
	it("is empty space when nothing protected is above the target", () => {
		expect(isEmptyPreviewAreaTarget(target())).toBe(true);
	});

	it("leaves layers, handles, the canvas, buttons and the settings panel alone", () => {
		for (const marker of [
			"[data-annotation-layers]",
			"[data-preview-frame]",
			"[data-preview-keep]",
			"button",
			"[role='slider']",
			"[data-settings-panel]",
			"[data-timeline-root]",
		]) {
			expect(isEmptyPreviewAreaTarget(target(marker))).toBe(false);
		}
	});

	it("leaves popovers, menus, dialogs and the colour picker alone, even though they bubble out of portals", () => {
		for (const marker of [
			"[data-radix-popper-content-wrapper]",
			"[data-slot='popover-content']",
			"[role='menu']",
			"[role='dialog']",
			"[data-radix-portal]",
		]) {
			expect(isEmptyPreviewAreaTarget(target(marker))).toBe(false);
		}
	});

	it("claims nothing for targets that are not elements", () => {
		expect(isEmptyPreviewAreaTarget(null)).toBe(false);
		expect(isEmptyPreviewAreaTarget({} as EventTarget)).toBe(false);
	});
});
