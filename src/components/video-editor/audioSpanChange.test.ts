import { describe, expect, it } from "vitest";
import { changeAudioSpan } from "./audioSpanChange";
import type { AudioRegion } from "./types";

const region: AudioRegion = {
	id: "audio-1",
	startMs: 1000,
	endMs: 4000,
	audioPath: "a.mp3",
	volume: 1,
	sourceStartMs: 2000,
};

describe("audio span changes", () => {
	it("moves without changing the source window", () => {
		expect(changeAudioSpan(region, 3000, 6000, 10000)).toEqual({
			...region,
			startMs: 3000,
			endMs: 6000,
		});
	});

	it("treats a sub-millisecond drift between edges as a move", () => {
		const moved = changeAudioSpan(region, 1500.4, 4500.9, 10000);
		expect(moved.sourceStartMs).toBe(2000);
	});

	it("advances sourceStartMs when the left edge is trimmed in", () => {
		expect(changeAudioSpan(region, 1500, 4000, 10000)).toEqual({
			...region,
			startMs: 1500,
			sourceStartMs: 2500,
			sourceDurationMs: 10000,
		});
	});

	it("pulls sourceStartMs back when the left edge is extended out", () => {
		expect(changeAudioSpan(region, 500, 4000, 10000).sourceStartMs).toBe(1500);
	});

	it("stops the left edge at the start of the file", () => {
		// 2000 ms of audio sits before the region, so the left edge can reach 3000 - 2000 = 1000.
		const later = { ...region, startMs: 3000, endMs: 6000 };
		expect(changeAudioSpan(later, 0, 6000, 10000)).toMatchObject({
			startMs: 1000,
			endMs: 6000,
			sourceStartMs: 0,
		});
	});

	it("stops the right edge at the end of the file", () => {
		// 2000 ms into a 10000 ms file leaves 8000 ms of audio from startMs 1000.
		expect(changeAudioSpan(region, 1000, 20000, 10000)).toMatchObject({
			startMs: 1000,
			endMs: 9000,
			sourceStartMs: 2000,
		});
	});

	it("does not limit the right edge while the file length is unknown", () => {
		const result = changeAudioSpan(region, 1000, 20000, undefined);
		expect(result.endMs).toBe(20000);
		expect(result).not.toHaveProperty("sourceDurationMs");
	});

	it("treats a missing sourceStartMs as 0", () => {
		const legacy: AudioRegion = { id: "a", startMs: 0, endMs: 5000, audioPath: "a.mp3", volume: 1 };
		expect(changeAudioSpan(legacy, 2000, 5000).sourceStartMs).toBe(2000);
		expect(changeAudioSpan(legacy, 1000, 6000).sourceStartMs).toBe(0);
	});
});
