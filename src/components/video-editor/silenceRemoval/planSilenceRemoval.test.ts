import { describe, expect, it } from "vitest";
import { planSilenceRemoval } from "./planSilenceRemoval";
import type { AnnotationRegion, AudioRegion, ClipRegion, ZoomRegion } from "../types";

describe("planSilenceRemoval", () => {
	const initialClip: ClipRegion = {
		id: "clip-1",
		startMs: 0,
		endMs: 10000,
		sourceStartMs: 0,
	};

	it("discloses zoom regions and annotations falling inside cut sections", () => {
		// Silence from 3000 to 5000 (2000ms duration)
		const silence = [{ startMs: 3000, endMs: 5000, durationMs: 2000 }];

		// Zoom 1: 3500-4500 (falls entirely inside cut) -> should be removed
		// Zoom 2: 6000-7000 (after cut) -> should be shifted by 2000ms to 4000-5000
		const zoomRegions: ZoomRegion[] = [
			{ id: "z1", startMs: 3500, endMs: 4500, scale: 1.5, focus: { cx: 0.5, cy: 0.5 } },
			{ id: "z2", startMs: 6000, endMs: 7000, scale: 1.5, focus: { cx: 0.5, cy: 0.5 } },
		];

		// Annotation: 3200-4800 (falls entirely inside cut) -> should be removed
		const annotationRegions: AnnotationRegion[] = [
			{
				id: "a1",
				startMs: 3200,
				endMs: 4800,
				type: "text",
				content: "Intro banner",
				position: { x: 50, y: 50 },
				size: { width: 200, height: 100 },
				style: { fontSize: 20, fontFamily: "sans-serif", color: "#fff" },
				zIndex: 1,
			},
		];

		const plan = planSilenceRemoval({
			clipRegions: [initialClip],
			zoomRegions,
			annotationRegions,
			audioRegions: [],
			silenceIntervals: silence,
			totalDurationMs: 10000,
		});

		// Verify explicit impact disclosures
		expect(plan.impact.silenceCount).toBe(1);
		expect(plan.impact.timeSavedMs).toBe(2000);
		expect(plan.impact.newTotalDurationMs).toBe(8000);
		expect(plan.impact.removedZoomCount).toBe(1);
		expect(plan.impact.removedAnnotationCount).toBe(1);
		expect(plan.impact.removedAnnotationDescriptions[0]).toContain("Intro banner");

		// Verify resulting items
		expect(plan.newZoomRegions.length).toBe(1);
		expect(plan.newZoomRegions[0].id).toBe("z2");
		expect(plan.newZoomRegions[0].startMs).toBe(4000); // 6000 - 2000
		expect(plan.newZoomRegions[0].endMs).toBe(5000); // 7000 - 2000

		expect(plan.newAnnotationRegions.length).toBe(0);

		// Verify clips: 0-3000 (3s) and 5000-10000 (5s) -> total 8000
		expect(plan.newClipRegions.length).toBe(2);
		expect(plan.newClipRegions[0].startMs).toBe(0);
		expect(plan.newClipRegions[0].endMs).toBe(3000);
		expect(plan.newClipRegions[0].sourceStartMs).toBe(0);

		expect(plan.newClipRegions[1].startMs).toBe(3000);
		expect(plan.newClipRegions[1].endMs).toBe(8000);
		expect(plan.newClipRegions[1].sourceStartMs).toBe(5000);
	});

	it("preserves background audio as continuous unbroken playback", () => {
		// Cut silence from 2000 to 4000 (2000ms duration)
		const silence = [{ startMs: 2000, endMs: 4000, durationMs: 2000 }];

		// Continuous music track from 0 to 10000
		const music: AudioRegion = {
			id: "audio-1",
			audioPath: "bgm.mp3",
			startMs: 0,
			endMs: 10000,
		};

		const plan = planSilenceRemoval({
			clipRegions: [initialClip],
			zoomRegions: [],
			annotationRegions: [],
			audioRegions: [music],
			silenceIntervals: silence,
			totalDurationMs: 10000,
			preserveContinuousAudio: true,
		});

		expect(plan.newAudioRegions.length).toBe(1);
		// Remains continuous starting at 0, tail clamped to new total duration (8000ms)
		expect(plan.newAudioRegions[0].startMs).toBe(0);
		expect(plan.newAudioRegions[0].endMs).toBe(8000);
	});
});
