import { afterEach, describe, expect, it, vi } from "vitest";

import {
	describeFfmpegAudioMuxFailure,
	isFfmpegAudioMuxAvailable,
	resolveAudioMuxRoute,
} from "./audioProcessorShared";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("audio mux route", () => {
	const route = (overrides: Partial<Parameters<typeof resolveAudioMuxRoute>[0]>) =>
		resolveAudioMuxRoute({
			hasAudio: true,
			ffmpegAvailable: true,
			browserAacSupported: true,
			prefersFfmpeg: false,
			...overrides,
		});

	it("uses FFmpeg for a split clip on the desktop", () => {
		expect(route({ prefersFfmpeg: true })).toBe("ffmpeg");
	});

	it("mixes a split clip in the browser when FFmpeg is not available (the web app)", () => {
		expect(route({ prefersFfmpeg: true, ffmpegAvailable: false })).toBe("browser");
	});

	it("falls back to FFmpeg only where it exists when the browser has no AAC", () => {
		expect(route({ browserAacSupported: false })).toBe("ffmpeg");
		expect(route({ browserAacSupported: false, ffmpegAvailable: false })).toBe("unsupported");
	});

	it("needs no route without audio", () => {
		expect(route({ hasAudio: false, browserAacSupported: false, ffmpegAvailable: false })).toBe("none");
	});
});

describe("FFmpeg audio mux availability", () => {
	it("is off in the web app, whose mux functions are stubs", () => {
		vi.stubGlobal("window", { electronAPI: { isWebMode: true, muxExportedVideoAudio: vi.fn() } });
		expect(isFfmpegAudioMuxAvailable()).toBe(false);
	});

	it("is on where the desktop API offers the mux", () => {
		vi.stubGlobal("window", { electronAPI: { muxExportedVideoAudio: vi.fn() } });
		expect(isFfmpegAudioMuxAvailable()).toBe(true);
	});

	it("is off without an API", () => {
		vi.stubGlobal("window", {});
		expect(isFfmpegAudioMuxAvailable()).toBe(false);
	});
});

describe("FFmpeg audio mux failure message", () => {
	it("keeps what FFmpeg or the mixer reported", () => {
		expect(
			describeFfmpegAudioMuxFailure({
				success: false,
				error: "Audio stream #1 not found",
				stderr: "...\n[aac @ 0x1] Invalid data found when processing input\n",
			}),
		).toBe(
			"Failed to mux exported audio with FFmpeg: Audio stream #1 not found; FFmpeg output: ...\n[aac @ 0x1] Invalid data found when processing input",
		);
	});

	it("says so when the mux returned no message at all", () => {
		expect(describeFfmpegAudioMuxFailure({ success: false, tempPath: null })).toBe(
			"Failed to mux exported audio with FFmpeg (the mux returned no error message)",
		);
	});
});
