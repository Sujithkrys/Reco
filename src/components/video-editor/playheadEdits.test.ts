import { describe, expect, it } from "vitest";
import { type PlayheadEditLayers, planSplitAtPlayhead, planTrimToPlayhead } from "./playheadEdits";
import {
	type AnnotationRegion,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
} from "./types";

function annotation(id: string, startMs: number, endMs: number): AnnotationRegion {
	return {
		id,
		startMs,
		endMs,
		type: "text",
		content: id,
		position: { ...DEFAULT_ANNOTATION_POSITION },
		size: { ...DEFAULT_ANNOTATION_SIZE },
		style: { ...DEFAULT_ANNOTATION_STYLE },
		zIndex: 1,
	};
}

const layers: PlayheadEditLayers = {
	clipRegions: [
		{ id: "clip-1", startMs: 0, endMs: 4000, speed: 1 },
		{ id: "clip-2", startMs: 4000, endMs: 10000, sourceStartMs: 4000, speed: 1 },
	],
	zoomRegions: [
		{ id: "zoom-1", startMs: 5000, endMs: 7000, depth: 3, focus: { cx: 0.5, cy: 0.5 }, mode: "auto" },
		{ id: "zoom-2", startMs: 8000, endMs: 9000, depth: 2, focus: { cx: 0.5, cy: 0.5 } },
	],
	annotationRegions: [annotation("text-1", 6000, 8000), annotation("text-2", 0, 1000)],
	audioRegions: [
		{ id: "audio-1", startMs: 2000, endMs: 9000, audioPath: "a.mp3", volume: 1, sourceStartMs: 500 },
	],
};

let counter = 0;
const ids = {
	clip: () => `clip-new-${++counter}`,
	zoom: () => `zoom-new-${++counter}`,
	annotation: () => `text-new-${++counter}`,
	audio: () => `audio-new-${++counter}`,
};

describe("split at playhead", () => {
	it("with nothing selected, splits the clip and every layer strictly under the playhead", () => {
		const { layers: next, count } = planSplitAtPlayhead(layers, "all", 6500, ids);

		// clip-2, zoom-1, text-1 and audio-1 contain 6500; zoom-2 and text-2 do not.
		expect(count).toBe(4);
		expect(next.clipRegions).toHaveLength(3);
		expect(next.zoomRegions.map((z) => [z.startMs, z.endMs])).toEqual([
			[5000, 6500],
			[6500, 7000],
			[8000, 9000],
		]);
		expect(next.annotationRegions).toHaveLength(3);
		expect(next.audioRegions[1]).toMatchObject({ startMs: 6500, sourceStartMs: 500 + 4500 });
	});

	it("with a layer selected, splits only that layer", () => {
		const { layers: next, count } = planSplitAtPlayhead(
			layers,
			{ kind: "zoom", id: "zoom-1" },
			6500,
			ids,
		);

		expect(count).toBe(1);
		expect(next.zoomRegions).toHaveLength(3);
		expect(next.clipRegions).toBe(layers.clipRegions);
		expect(next.annotationRegions).toBe(layers.annotationRegions);
		expect(next.audioRegions).toBe(layers.audioRegions);
	});

	it("does nothing when the playhead is on an item's edge", () => {
		expect(planSplitAtPlayhead(layers, { kind: "zoom", id: "zoom-1" }, 5000, ids).count).toBe(0);
	});
});

describe("trim to playhead", () => {
	const options = { sourceDurationMs: 10000 };

	it("trims the start of the clip and every layer under the playhead", () => {
		const { layers: next, count } = planTrimToPlayhead(layers, "all", "start", 6500, options);

		expect(count).toBe(4);
		// The clip's source in-point moves with its start, like dragging the left edge.
		expect(next.clipRegions[1]).toMatchObject({ startMs: 6500, endMs: 10000, sourceStartMs: 6500 });
		expect(next.zoomRegions[0]).toMatchObject({ startMs: 6500, endMs: 7000 });
		expect(next.annotationRegions[0]).toMatchObject({ startMs: 6500, endMs: 8000 });
		// Audio keeps playing the same sound at 6500: 500 + (6500 - 2000).
		expect(next.audioRegions[0]).toMatchObject({ startMs: 6500, endMs: 9000, sourceStartMs: 5000 });
		// Items not under the playhead are untouched.
		expect(next.zoomRegions[1]).toBe(layers.zoomRegions[1]);
		expect(next.annotationRegions[1]).toBe(layers.annotationRegions[1]);
	});

	it("trims the end of only the selected layer", () => {
		const { layers: next, count } = planTrimToPlayhead(
			layers,
			{ kind: "audio", id: "audio-1" },
			"end",
			6500,
			options,
		);

		expect(count).toBe(1);
		expect(next.audioRegions[0]).toMatchObject({ startMs: 2000, endMs: 6500, sourceStartMs: 500 });
		expect(next.clipRegions).toEqual(layers.clipRegions);
	});

	it("counts nothing when the playhead sits on an item's start", () => {
		expect(planTrimToPlayhead(layers, { kind: "zoom", id: "zoom-1" }, "start", 5000, options).count).toBe(
			0,
		);
	});

	it("counts nothing when the playhead is past every layer", () => {
		const empty: PlayheadEditLayers = { ...layers, clipRegions: [] };
		expect(planTrimToPlayhead(empty, "all", "end", 9500, options).count).toBe(0);
	});
});
