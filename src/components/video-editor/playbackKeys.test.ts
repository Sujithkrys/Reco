import { describe, expect, it } from "vitest";
import { mapPlaybackKey, type PlaybackKeyInput, seekTargetSeconds } from "./playbackKeys";

const base: PlaybackKeyInput = {
	key: "",
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	editable: false,
	hasLayerSelected: false,
};
const press = (key: string, over: Partial<PlaybackKeyInput> = {}) => mapPlaybackKey({ ...base, key, ...over });

describe("mapPlaybackKey", () => {
	it("seeks one second, five with Shift, one frame with Alt", () => {
		expect(press("ArrowRight")).toEqual({ type: "seekSeconds", seconds: 1 });
		expect(press("ArrowLeft")).toEqual({ type: "seekSeconds", seconds: -1 });
		expect(press("ArrowRight", { shiftKey: true })).toEqual({ type: "seekSeconds", seconds: 5 });
		expect(press("ArrowLeft", { shiftKey: true })).toEqual({ type: "seekSeconds", seconds: -5 });
		expect(press("ArrowRight", { altKey: true })).toEqual({ type: "seekFrames", frames: 1 });
		expect(press("ArrowLeft", { altKey: true, shiftKey: true })).toEqual({ type: "seekFrames", frames: -1 });
	});

	it("leaves the arrows to the selected layer, text fields and Ctrl combinations", () => {
		expect(press("ArrowLeft", { hasLayerSelected: true })).toBeNull();
		expect(press("ArrowLeft", { editable: true })).toBeNull();
		expect(press("ArrowLeft", { ctrlKey: true })).toBeNull();
		expect(press("ArrowLeft", { metaKey: true })).toBeNull();
	});

	it("ignores other keys, including Up and Down", () => {
		for (const key of ["ArrowUp", "ArrowDown", " ", "a", "Escape"]) expect(press(key)).toBeNull();
	});
});

describe("seekTargetSeconds", () => {
	it("moves by seconds and clamps to 0 and the duration", () => {
		expect(seekTargetSeconds(10, { type: "seekSeconds", seconds: 5 }, 60)).toBe(15);
		expect(seekTargetSeconds(2, { type: "seekSeconds", seconds: -5 }, 60)).toBe(0);
		expect(seekTargetSeconds(58, { type: "seekSeconds", seconds: 5 }, 60)).toBe(60);
	});

	it("moves one frame at the video's frame rate, falling back to 30 fps", () => {
		expect(seekTargetSeconds(1, { type: "seekFrames", frames: 1 }, 60, 60)).toBeCloseTo(1 + 1 / 60);
		expect(seekTargetSeconds(1, { type: "seekFrames", frames: -1 }, 60)).toBeCloseTo(1 - 1 / 30);
		expect(seekTargetSeconds(1, { type: "seekFrames", frames: 1 }, 60, 0)).toBeCloseTo(1 + 1 / 30);
		expect(seekTargetSeconds(1, { type: "seekFrames", frames: 1 }, 60, Number.NaN)).toBeCloseTo(1 + 1 / 30);
	});

	it("handles a missing duration and a bad playhead", () => {
		expect(seekTargetSeconds(5, { type: "seekSeconds", seconds: 1 }, 0)).toBe(0);
		expect(seekTargetSeconds(Number.NaN, { type: "seekSeconds", seconds: 1 }, 10)).toBe(1);
	});
});
