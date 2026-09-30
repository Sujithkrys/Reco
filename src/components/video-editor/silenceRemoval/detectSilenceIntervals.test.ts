import { describe, expect, it } from "vitest";
import { detectSilenceIntervals } from "./detectSilenceIntervals";

describe("detectSilenceIntervals", () => {
	const sampleRate = 1000; // 1 sample = 1 ms for simple reasoning

	it("returns empty array when buffer is completely loud audio", () => {
		// 2 seconds of loud signal (amplitude 0.5 ~ -6 dB)
		const data = new Float32Array(2000).fill(0.5);
		const result = detectSilenceIntervals(data, sampleRate, {
			thresholdDb: -38,
			minDurationMs: 300,
		});
		expect(result).toEqual([]);
	});

	it("detects completely silent audio", () => {
		// 2 seconds of silence (amplitude 0)
		const data = new Float32Array(2000).fill(0);
		const result = detectSilenceIntervals(data, sampleRate, {
			thresholdDb: -38,
			minDurationMs: 500,
			speechPaddingMs: 100,
		});
		expect(result.length).toBe(1);
		// Beginning and end clamp to edges without padding
		expect(result[0].startMs).toBe(0);
		expect(result[0].endMs).toBe(2000);
		expect(result[0].durationMs).toBe(2000);
	});

	it("detects silence in the middle of speech with padding applied", () => {
		// 0-500ms: Speech (0.5)
		// 500-1500ms: Silence (0) -> 1000ms duration
		// 1500-2000ms: Speech (0.5)
		const data = new Float32Array(2000);
		data.fill(0.5, 0, 500);
		data.fill(0, 500, 1500);
		data.fill(0.5, 1500, 2000);

		const result = detectSilenceIntervals(data, sampleRate, {
			thresholdDb: -38,
			minDurationMs: 400,
			speechPaddingMs: 100,
			windowSizeMs: 20,
		});

		expect(result.length).toBe(1);
		// With 100ms padding: silence starts at 500 + 100 = 600ms, ends at 1500 - 100 = 1400ms
		expect(result[0].startMs).toBe(600);
		expect(result[0].endMs).toBe(1400);
		expect(result[0].durationMs).toBe(800);
	});

	it("ignores short pauses below minDurationMs", () => {
		// 0-500ms: Speech
		// 500-700ms: Short pause (200ms)
		// 700-1500ms: Speech
		const data = new Float32Array(1500);
		data.fill(0.5, 0, 500);
		data.fill(0, 500, 700);
		data.fill(0.5, 700, 1500);

		const result = detectSilenceIntervals(data, sampleRate, {
			thresholdDb: -38,
			minDurationMs: 500,
			speechPaddingMs: 50,
			windowSizeMs: 20,
		});

		expect(result).toEqual([]);
	});
});
