import { describe, expect, it } from "vitest";
import { DUPLICATE_OFFSET_PERCENT, duplicateRegionAbove } from "./annotationDuplicate";
import {
	type AnnotationRegion,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_FIGURE_DATA,
	DEFAULT_SHAPE_DATA,
} from "./types";

function region(id: string, over: Partial<AnnotationRegion>): AnnotationRegion {
	return {
		id,
		startMs: 1200,
		endMs: 4800,
		type: "text",
		content: "Hi",
		position: { ...DEFAULT_ANNOTATION_POSITION },
		size: { ...DEFAULT_ANNOTATION_SIZE },
		style: { ...DEFAULT_ANNOTATION_STYLE },
		zIndex: 3,
		trackIndex: 0,
		...over,
	};
}

const sources: Record<string, AnnotationRegion> = {
	text: region("annotation-1", { type: "text", content: "Hello", textContent: "Hello" }),
	image: region("annotation-1", {
		type: "image",
		content: "data:image/png;base64,AAA",
		imageContent: "data:image/png;base64,AAA",
		imageFileName: "a.png",
	}),
	shape: region("annotation-1", { type: "shape", shapeData: { ...DEFAULT_SHAPE_DATA } }),
	arrow: region("annotation-1", { type: "figure", figureData: { ...DEFAULT_FIGURE_DATA } }),
	blur: region("annotation-1", { type: "blur", blurIntensity: 30, blurColor: "#000000" }),
};

const rowOf = (list: AnnotationRegion[], id: string) => list.find((r) => r.id === id)?.trackIndex;

describe("duplicateRegionAbove", () => {
	for (const [kind, source] of Object.entries(sources)) {
		it(`${kind}: a separate item directly above the original with the same time span`, () => {
			const upper = region("annotation-0", { trackIndex: 0 });
			const original = { ...source, trackIndex: 1 };
			const lower = region("annotation-2", { trackIndex: 2 });
			const result = duplicateRegionAbove(original, [upper, original, lower], "annotation-9", 10);
			const copy = result.find((r) => r.id === "annotation-9")!;
			expect(result).toHaveLength(4);
			expect(copy.startMs).toBe(original.startMs);
			expect(copy.endMs).toBe(original.endMs);
			expect(copy.type).toBe(original.type);
			expect(copy.zIndex).toBe(10);
			expect(copy.position.x).toBeCloseTo(original.position.x + DUPLICATE_OFFSET_PERCENT);
			expect(copy.position.y).toBeCloseTo(original.position.y + DUPLICATE_OFFSET_PERCENT);
			expect(copy.size).toEqual(original.size);
			// Row order top to bottom: upper, copy, original, lower.
			expect(rowOf(result, "annotation-0")).toBe(0);
			expect(rowOf(result, "annotation-9")).toBe(1);
			expect(rowOf(result, original.id)).toBe(2);
			expect(rowOf(result, "annotation-2")).toBe(3);
		});
	}

	it("no two layers share a row, including when rows have gaps", () => {
		const a = region("a", { trackIndex: 0 });
		const b = region("b", { trackIndex: 3 });
		const c = region("c", { trackIndex: 5 });
		const result = duplicateRegionAbove(b, [a, b, c], "copy", 9);
		const rows = result.map((r) => r.trackIndex);
		expect(new Set(rows).size).toBe(rows.length);
		expect(rowOf(result, "a")).toBe(0);
		expect(rowOf(result, "copy")).toBe(3);
		expect(rowOf(result, "b")).toBe(4);
		expect(rowOf(result, "c")).toBe(6);
	});

	it("copying the top layer puts the copy on row 0", () => {
		const a = region("a", { trackIndex: 0 });
		const result = duplicateRegionAbove(a, [a], "copy", 2);
		expect(rowOf(result, "copy")).toBe(0);
		expect(rowOf(result, "a")).toBe(1);
	});

	it("treats a missing track index as row 0 and leaves the input list unchanged", () => {
		const bare = { ...sources.text, trackIndex: undefined };
		const list = [bare];
		const before = structuredClone(list);
		const result = duplicateRegionAbove(bare, list, "x", 1);
		expect(rowOf(result, "x")).toBe(0);
		expect(rowOf(result, bare.id)).toBe(1);
		expect(list).toEqual(before);
	});

	it("keeps each layer type's content and shares no nested objects with the original", () => {
		const copyOf = (kind: string) =>
			duplicateRegionAbove(sources[kind], [sources[kind]], "x", 1).find((r) => r.id === "x")!;
		expect(copyOf("text").content).toBe("Hello");
		expect(copyOf("image")).toMatchObject({ content: "data:image/png;base64,AAA", imageFileName: "a.png" });
		expect(copyOf("shape").shapeData).toEqual(DEFAULT_SHAPE_DATA);
		expect(copyOf("arrow").figureData).toEqual(DEFAULT_FIGURE_DATA);
		expect(copyOf("blur")).toMatchObject({ blurIntensity: 30, blurColor: "#000000" });
		const shape = copyOf("shape");
		expect(shape.style).not.toBe(sources.shape.style);
		expect(shape.shapeData).not.toBe(sources.shape.shapeData);
	});
});
