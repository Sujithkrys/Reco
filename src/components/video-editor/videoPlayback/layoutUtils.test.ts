import { describe, expect, it } from "vitest";

import { ADVANCED_VERTICAL_PADDING_MAX } from "../types";
import {
	computePaddedLayout,
	isNoBackground,
	NO_BACKGROUND_WALLPAPER,
	resolveBackgroundForLayout,
	scalePreviewBorderRadius,
} from "./layoutUtils";

const BASE_LAYOUT_PARAMS = {
	width: 1000,
	height: 1000,
	cropRegion: { x: 0, y: 0, width: 1, height: 1 },
	videoWidth: 1000,
	videoHeight: 1000,
};

describe("computePaddedLayout", () => {
	it("allows advanced bottom padding to pin the video to the top edge", () => {
		const layout = computePaddedLayout({
			...BASE_LAYOUT_PARAMS,
			padding: {
				top: 0,
				bottom: ADVANCED_VERTICAL_PADDING_MAX,
				left: 0,
				right: 0,
				linked: false,
			},
		});

		expect(layout.centerOffsetY).toBeCloseTo(0);
	});

	it("allows advanced top padding to pin the video to the bottom edge", () => {
		const layout = computePaddedLayout({
			...BASE_LAYOUT_PARAMS,
			padding: {
				top: ADVANCED_VERTICAL_PADDING_MAX,
				bottom: 0,
				left: 0,
				right: 0,
				linked: false,
			},
		});

		expect(layout.centerOffsetY + layout.croppedDisplayHeight).toBeCloseTo(
			BASE_LAYOUT_PARAMS.height,
		);
	});

	it("preserves linked padding centering behavior", () => {
		const layout = computePaddedLayout({
			...BASE_LAYOUT_PARAMS,
			padding: { top: 20, bottom: 20, left: 20, right: 20, linked: true },
		});

		expect(layout.centerOffsetY).toBeCloseTo(40);
		expect(layout.centerOffsetY + layout.croppedDisplayHeight).toBeCloseTo(960);
	});
});

describe("scalePreviewBorderRadius", () => {
	it("uses a percentage of the content's shorter side", () => {
		expect(scalePreviewBorderRadius(1920, 1080, 8)).toBeCloseTo(86.4, 6);
		expect(scalePreviewBorderRadius(960, 540, 8)).toBeCloseTo(43.2, 6);
		expect(scalePreviewBorderRadius(500, 1000, 8)).toBeCloseTo(40, 6);
	});

	it("clamps invalid or empty preview sizes to zero", () => {
		expect(scalePreviewBorderRadius(0, 540, 16)).toBe(0);
		expect(scalePreviewBorderRadius(960, 0, 16)).toBe(0);
		expect(scalePreviewBorderRadius(960, 540, -8)).toBe(0);
	});
});

describe("None background", () => {
	const wide = { ...BASE_LAYOUT_PARAMS, width: 1920, height: 1080, videoWidth: 1920, videoHeight: 1080 };

	it("is recognised only by its own value", () => {
		expect(isNoBackground(NO_BACKGROUND_WALLPAPER)).toBe(true);
		expect(isNoBackground("#000000")).toBe(false);
		expect(isNoBackground("")).toBe(false);
	});

	it("resolves to black and zero padding, and leaves every other background untouched", () => {
		expect(resolveBackgroundForLayout({ wallpaper: "none", padding: 20 })).toEqual({
			wallpaper: "#000000",
			padding: 0,
		});
		const kept = { wallpaper: "#123456", padding: 20 };
		expect(resolveBackgroundForLayout(kept)).toBe(kept);
	});

	it("does not touch the stored padding, so it returns with another background", () => {
		const stored = { top: 10, bottom: 10, left: 10, right: 10, linked: true };
		resolveBackgroundForLayout({ wallpaper: "none", padding: stored });
		expect(stored).toEqual({ top: 10, bottom: 10, left: 10, right: 10, linked: true });
		expect(resolveBackgroundForLayout({ wallpaper: "#fff", padding: stored }).padding).toBe(stored);
	});

	it("fills the canvas edge to edge when the video has the canvas ratio", () => {
		const { padding } = resolveBackgroundForLayout({ wallpaper: "none", padding: 30 });
		const layout = computePaddedLayout({ ...wide, padding });
		expect(layout.fullFrameDisplayW).toBeCloseTo(1920);
		expect(layout.fullFrameDisplayH).toBeCloseTo(1080);
		expect(layout.centerOffsetX).toBeCloseTo(0);
		expect(layout.centerOffsetY).toBeCloseTo(0);
	});

	it("fits a taller video to the canvas height and centres it, leaving bars at the sides", () => {
		const { padding } = resolveBackgroundForLayout({ wallpaper: "none", padding: 30 });
		const layout = computePaddedLayout({ ...wide, videoWidth: 1000, videoHeight: 1000, padding });
		expect(layout.fullFrameDisplayH).toBeCloseTo(1080);
		expect(layout.fullFrameDisplayW).toBeCloseTo(1080);
		expect(layout.centerOffsetX).toBeCloseTo((1920 - 1080) / 2);
		expect(layout.centerOffsetY).toBeCloseTo(0);
	});

	it("gives the same layout for the preview path and the export path", () => {
		// Both call resolveBackgroundForLayout, then computePaddedLayout, with the same inputs.
		const preview = computePaddedLayout({
			...wide,
			padding: resolveBackgroundForLayout({ wallpaper: "none", padding: 25 }).padding,
		});
		const exported = computePaddedLayout({
			...wide,
			padding: resolveBackgroundForLayout({ wallpaper: "none", padding: 25 }).padding,
		});
		expect(preview).toEqual(exported);
		const padded = computePaddedLayout({ ...wide, padding: 25 });
		expect(padded.fullFrameDisplayW).toBeLessThan(preview.fullFrameDisplayW);
	});
});
