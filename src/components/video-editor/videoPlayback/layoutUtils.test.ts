import { describe, expect, it } from "vitest";

import { ADVANCED_VERTICAL_PADDING_MAX } from "../types";
import {
	computePaddedLayout,
	isBackgroundOff,
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

describe("background switch", () => {
	const wide = { ...BASE_LAYOUT_PARAMS, width: 1920, height: 1080, videoWidth: 1920, videoHeight: 1080 };

	it("is off only for an explicit false", () => {
		expect(isBackgroundOff(false)).toBe(true);
		expect(isBackgroundOff(true)).toBe(false);
		expect(isBackgroundOff(undefined)).toBe(false);
	});

	it("off resolves to black and zero padding; on leaves the background as chosen", () => {
		expect(resolveBackgroundForLayout({ wallpaper: "#123456", padding: 20, backgroundEnabled: false })).toEqual({
			wallpaper: "#000000",
			padding: 0,
		});
		expect(resolveBackgroundForLayout({ wallpaper: "#123456", padding: 20, backgroundEnabled: true })).toEqual({
			wallpaper: "#123456",
			padding: 20,
		});
		expect(resolveBackgroundForLayout({ wallpaper: "#123456", padding: 20 })).toEqual({
			wallpaper: "#123456",
			padding: 20,
		});
	});

	it("keeps the stored wallpaper and padding, so switching on restores them", () => {
		const stored = { wallpaper: "/wallpapers/a.jpg", padding: { top: 10, bottom: 10, left: 10, right: 10, linked: true } };
		const copy = structuredClone(stored);
		resolveBackgroundForLayout({ ...stored, backgroundEnabled: false });
		expect(stored).toEqual(copy);
		expect(resolveBackgroundForLayout({ ...stored, backgroundEnabled: true }).padding).toBe(stored.padding);
	});

	it("off fills the canvas edge to edge when the video has the canvas ratio, and padding is back when on", () => {
		const off = computePaddedLayout({
			...wide,
			padding: resolveBackgroundForLayout({ wallpaper: "#fff", padding: 30, backgroundEnabled: false }).padding,
		});
		expect(off.fullFrameDisplayW).toBeCloseTo(1920);
		expect(off.fullFrameDisplayH).toBeCloseTo(1080);
		expect(off.centerOffsetX).toBeCloseTo(0);
		const on = computePaddedLayout({
			...wide,
			padding: resolveBackgroundForLayout({ wallpaper: "#fff", padding: 30, backgroundEnabled: true }).padding,
		});
		expect(on.fullFrameDisplayW).toBeLessThan(1920);
	});

	it("off fits a taller video to the canvas height, centred, with bars at the sides", () => {
		const { padding } = resolveBackgroundForLayout({ wallpaper: "#fff", padding: 30, backgroundEnabled: false });
		const layout = computePaddedLayout({ ...wide, videoWidth: 1000, videoHeight: 1000, padding });
		expect(layout.fullFrameDisplayH).toBeCloseTo(1080);
		expect(layout.centerOffsetX).toBeCloseTo((1920 - 1080) / 2);
	});
});