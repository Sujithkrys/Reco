import { describe, expect, it } from "vitest";
import { buildExportRenderOptions } from "./buildExportRenderOptions";

type Input = Parameters<typeof buildExportRenderOptions>[0];

function build(wallpaper: string, padding: number) {
	const appearance = { wallpaper, padding, webcam: {}, resolvedWebcamVideoUrl: null } as unknown as Input["appearance"];
	const timeline = {
		clipRegions: [],
		trimRegions: [],
		annotationRegions: [],
		autoCaptions: [],
		autoCaptionSettings: {},
		generatedClipRegions: [],
	} as unknown as Input["timeline"];
	return buildExportRenderOptions({
		appearance,
		timeline,
		effectiveSpeedRegions: [],
		effectiveZoomRegions: [],
		effectiveCursorTelemetry: [],
		effectiveShowCursor: false,
		previewWidth: 100,
		previewHeight: 100,
		shadowIntensity: 0,
		onProgress: () => {},
	} as Input);
}

describe("export options for the None background", () => {
	it("exports black with no padding, the same resolution the preview uses", () => {
		const options = build("none", 24);
		expect(options.wallpaper).toBe("#000000");
		expect(options.padding).toBe(0);
	});

	it("leaves every other background and its padding alone", () => {
		const options = build("#123456", 24);
		expect(options.wallpaper).toBe("#123456");
		expect(options.padding).toBe(24);
	});
});
