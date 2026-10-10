import { describe, expect, it } from "vitest";
import { replaceWithSplit, splitAnnotationAt, splitAudioAt, splitZoomAt } from "./layerSplit";
import {
	type AnnotationRegion,
	type AudioRegion,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	type ZoomRegion,
} from "./types";

const newId = () => "new-id";

const annotation: AnnotationRegion = {
	id: "annotation-1",
	startMs: 1000,
	endMs: 5000,
	type: "text",
	content: "Hello",
	textContent: "Hello",
	position: { ...DEFAULT_ANNOTATION_POSITION },
	size: { ...DEFAULT_ANNOTATION_SIZE },
	style: { ...DEFAULT_ANNOTATION_STYLE, color: "#ff0000" },
	zIndex: 3,
};

const zoom: ZoomRegion = {
	id: "zoom-1",
	startMs: 2000,
	endMs: 6000,
	depth: 4,
	focus: { cx: 0.3, cy: 0.7 },
	mode: "manual",
};

const audio: AudioRegion = {
	id: "audio-1",
	startMs: 1000,
	endMs: 9000,
	audioPath: "a.mp3",
	volume: 0.5,
	sourceStartMs: 2500,
	sourceDurationMs: 20000,
};

describe("layer split", () => {
	it("splits an annotation into two halves with the same content and style", () => {
		const split = splitAnnotationAt(annotation, 3000, newId);

		expect(split?.left).toEqual({ ...annotation, endMs: 3000 });
		expect(split?.right).toEqual({ ...annotation, id: "new-id", startMs: 3000 });
	});

	it("splits a zoom into two zooms with the same settings", () => {
		const split = splitZoomAt(zoom, 4000, newId);

		expect(split?.left).toEqual({ ...zoom, endMs: 4000 });
		expect(split?.right).toEqual({ ...zoom, id: "new-id", startMs: 4000 });
	});

	it("continues the audio file in the second half", () => {
		// 2000 ms into a region that starts reading the file at 2500 ms.
		const split = splitAudioAt(audio, 3000, newId);

		expect(split?.left).toEqual({ ...audio, endMs: 3000 });
		expect(split?.right).toEqual({
			...audio,
			id: "new-id",
			startMs: 3000,
			sourceStartMs: 4500,
		});
	});

	it("treats an untrimmed audio region as starting at the file start", () => {
		const { sourceStartMs: _ignored, ...untrimmed } = audio;
		expect(splitAudioAt(untrimmed, 4000, newId)?.right.sourceStartMs).toBe(3000);
	});

	it.each([
		["at the start", 1000],
		["at the end", 5000],
		["before", 500],
		["after", 6000],
		["not a number", Number.NaN],
	])("skips the split when the playhead is %s", (_label, atMs) => {
		expect(splitAnnotationAt(annotation, atMs, newId)).toBeNull();
	});

	it("replaces the split item with both halves in place", () => {
		const other = { ...annotation, id: "annotation-2" };
		const split = splitAnnotationAt(annotation, 3000, newId);
		if (!split) throw new Error("expected a split");

		expect(replaceWithSplit([annotation, other], annotation.id, split).map((a) => a.id)).toEqual([
			"annotation-1",
			"new-id",
			"annotation-2",
		]);
	});
});
