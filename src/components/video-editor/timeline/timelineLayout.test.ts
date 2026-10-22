import { describe, expect, it } from "vitest";
import {
	getTimelineContentMinHeightPx,
	getTimelineRowsMinHeightPx,
	getTimelineRowSizeClassName,
	getTimelineViewportStretchFactor,
	TIMELINE_ROW_GAP_PX,
	TIMELINE_ROW_HEIGHT_PX,
	TIMELINE_AXIS_HEIGHT_PX,
	TIMELINE_ROW_MIN_HEIGHT_PX,
	TIMELINE_VISIBLE_ROW_COUNT,
} from "./timelineLayout";

describe("timelineLayout", () => {
	it("reserves vertical space for every rendered timeline row", () => {
		expect(getTimelineRowsMinHeightPx(5)).toBe(5 * TIMELINE_ROW_MIN_HEIGHT_PX);
		expect(getTimelineContentMinHeightPx(5)).toBe(
			TIMELINE_AXIS_HEIGHT_PX + 5 * TIMELINE_ROW_MIN_HEIGHT_PX,
		);
	});

	it("ignores invalid row counts", () => {
		expect(getTimelineRowsMinHeightPx(-1)).toBe(0);
		expect(getTimelineRowsMinHeightPx(Number.NaN)).toBe(0);
		expect(getTimelineContentMinHeightPx(Number.POSITIVE_INFINITY)).toBe(
			TIMELINE_AXIS_HEIGHT_PX,
		);
	});

	it("floors fractional row counts", () => {
		expect(getTimelineRowsMinHeightPx(2.9)).toBe(2 * TIMELINE_ROW_MIN_HEIGHT_PX);
		expect(getTimelineContentMinHeightPx(2.9)).toBe(
			TIMELINE_AXIS_HEIGHT_PX + 2 * TIMELINE_ROW_MIN_HEIGHT_PX,
		);
	});

	it("stretches content height to keep a two-row viewport", () => {
		expect(TIMELINE_VISIBLE_ROW_COUNT).toBe(2);
		expect(getTimelineViewportStretchFactor(2)).toBe(1);
		expect(getTimelineViewportStretchFactor(4)).toBe(2);
		expect(getTimelineViewportStretchFactor(5)).toBe(2.5);
		expect(getTimelineViewportStretchFactor(0)).toBe(1);
	});
});

describe("timeline row size", () => {
	it("a regular row has the fixed row height and never stretches to fill the panel", () => {
		const className = getTimelineRowSizeClassName(false);
		expect(className).toContain(`h-[${TIMELINE_ROW_HEIGHT_PX}px]`);
		expect(className).toContain("flex-none");
		expect(className).not.toContain("flex-1");
		expect(TIMELINE_ROW_HEIGHT_PX + TIMELINE_ROW_GAP_PX).toBe(TIMELINE_ROW_MIN_HEIGHT_PX);
	});

	it("a thin drop-target row stays thin: it does not grow on hover", () => {
		const className = getTimelineRowSizeClassName(true);
		expect(className).toContain("h-1.5");
		expect(className).not.toContain("hover:");
		expect(className).not.toContain("min-h");
	});
});
