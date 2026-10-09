import { describe, expect, it } from "vitest";
import { detectSilenceIntervals } from "./detectSilenceIntervals";
import { planSilenceRemoval } from "./planSilenceRemoval";
import type { ClipRegion, ZoomRegion } from "../types";

describe("Smart Cut Integration & Seam Audio Continuity", () => {
	it("executes smart cut across audio, maintains exact timeline sync, and keeps seams at zero-crossing/silent levels", () => {
		// 1. Simulate a realistic 10-second speech recording with 2 silent pauses:
		// - 0s to 3s: Speech (sine wave at 440Hz, amplitude 0.4)
		// - 3s to 5s: Dead air / Silence (amplitude 0.001) -> 2000ms pause
		// - 5s to 7.5s: Speech (sine wave at 330Hz, amplitude 0.4)
		// - 7.5s to 9s: Dead air / Silence (amplitude 0.001) -> 1500ms pause
		// - 9s to 10s: Speech (sine wave at 440Hz, amplitude 0.4)
		const sampleRate = 44100;
		const totalSamples = sampleRate * 10;
		const channelData = new Float32Array(totalSamples);

		const writeTone = (startSec: number, endSec: number, freq: number) => {
			const startSample = Math.floor(startSec * sampleRate);
			const endSample = Math.floor(endSec * sampleRate);
			for (let i = startSample; i < endSample; i++) {
				const t = (i - startSample) / sampleRate;
				// Add smooth envelope at start/end of speech
				let envelope = 1;
				const dur = endSec - startSec;
				if (t < 0.05) envelope = t / 0.05;
				else if (t > dur - 0.05) envelope = (dur - t) / 0.05;
				channelData[i] = Math.sin(2 * Math.PI * freq * t) * 0.4 * envelope;
			}
		};

		writeTone(0, 3.0, 440);
		// 3.0 to 5.0 is silence (left at 0)
		writeTone(5.0, 7.5, 330);
		// 7.5 to 9.0 is silence (left at 0)
		writeTone(9.0, 10.0, 440);

		// 2. Run detectSilenceIntervals with speech padding
		const speechPaddingMs = 100;
		const detectedSilences = detectSilenceIntervals(channelData, sampleRate, {
			thresholdDb: -38,
			minDurationMs: 400,
			speechPaddingMs,
		});

		expect(detectedSilences.length).toBe(2);

		// First silence: raw was 3000-5000. With 100ms padding: 3100-4900 (1800ms)
		expect(detectedSilences[0].startMs).toBe(3100);
		expect(detectedSilences[0].endMs).toBe(4900);
		expect(detectedSilences[0].durationMs).toBe(1800);

		// Second silence: raw was 7500-9000. With 100ms padding: 7600-8900 (1300ms)
		expect(detectedSilences[1].startMs).toBe(7600);
		expect(detectedSilences[1].endMs).toBe(8900);
		expect(detectedSilences[1].durationMs).toBe(1300);

		// Total silence excised = 1800 + 1300 = 3100ms.
		// New duration = 10000 - 3100 = 6900ms.

		// 3. Run planSilenceRemoval
		const initialClip: ClipRegion = {
			id: "clip-orig",
			startMs: 0,
			endMs: 10000,
			sourceStartMs: 0,
		};
		const zoomOnSpeech: ZoomRegion = {
			id: "z-speech",
			startMs: 1000,
			endMs: 2500,
			scale: 1.5,
			focus: { cx: 0.5, cy: 0.5 },
		};
		const zoomInSilence: ZoomRegion = {
			id: "z-silence",
			startMs: 3500,
			endMs: 4500,
			scale: 1.5,
			focus: { cx: 0.5, cy: 0.5 },
		};

		const plan = planSilenceRemoval({
			clipRegions: [initialClip],
			zoomRegions: [zoomOnSpeech, zoomInSilence],
			annotationRegions: [],
			audioRegions: [],
			silenceIntervals: detectedSilences,
			totalDurationMs: 10000,
		});

		// Verify disclosures
		expect(plan.impact.silenceCount).toBe(2);
		expect(plan.impact.timeSavedMs).toBe(3100);
		expect(plan.impact.newTotalDurationMs).toBe(6900);
		expect(plan.impact.removedZoomCount).toBe(1); // z-silence was removed

		// Verify clips: 3 keep segments abutted with zero gap
		expect(plan.newClipRegions.length).toBe(3);
		expect(plan.newClipRegions[0].startMs).toBe(0);
		expect(plan.newClipRegions[0].endMs).toBe(3100);
		expect(plan.newClipRegions[0].sourceStartMs).toBe(0);

		expect(plan.newClipRegions[1].startMs).toBe(3100);
		expect(plan.newClipRegions[1].endMs).toBe(3100 + (7600 - 4900)); // 3100 + 2700 = 5800
		expect(plan.newClipRegions[1].sourceStartMs).toBe(4900);

		expect(plan.newClipRegions[2].startMs).toBe(5800);
		expect(plan.newClipRegions[2].endMs).toBe(5800 + (10000 - 8900)); // 5800 + 1100 = 6900
		expect(plan.newClipRegions[2].sourceStartMs).toBe(8900);

		// 4. Verify Audio Seam Continuity:
		// Check that at the cut points (sourceEnd of clip i and sourceStart of clip i+1),
		// the audio amplitude is in the silent zone (near zero), guaranteeing no pop or click!
		for (let i = 0; i < plan.newClipRegions.length - 1; i++) {
			const clipA = plan.newClipRegions[i];
			const clipB = plan.newClipRegions[i + 1];

			const sourceEndSampleA = Math.floor((clipA.sourceStartMs + (clipA.endMs - clipA.startMs)) / 1000 * sampleRate);
			const sourceStartSampleB = Math.floor(clipB.sourceStartMs / 1000 * sampleRate);

			const ampAtCutA = channelData[sourceEndSampleA - 1];
			const ampAtCutB = channelData[sourceStartSampleB];

			// Because speech cushion keeps 100ms inside the silent buffer,
			// amplitudes at the cut boundary are strictly near 0
			expect(Math.abs(ampAtCutA)).toBeLessThan(0.01);
			expect(Math.abs(ampAtCutB)).toBeLessThan(0.01);

			// Step delta is negligible (no loud pop/click step discontinuity)
			const delta = Math.abs(ampAtCutB - ampAtCutA);
			expect(delta).toBeLessThan(0.01);
		}

		// 5. Verify zoom region sync:
		// zoomOnSpeech (1000-2500) occurred before any cut, so its timing is preserved exactly
		expect(plan.newZoomRegions.length).toBe(1);
		expect(plan.newZoomRegions[0].id).toBe("z-speech");
		expect(plan.newZoomRegions[0].startMs).toBe(1000);
		expect(plan.newZoomRegions[0].endMs).toBe(2500);
	});
});
