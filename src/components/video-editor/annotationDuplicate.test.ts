import { describe, expect, it } from "vitest";
import { buildDuplicateRegion, DUPLICATE_OFFSET_PERCENT } from "./annotationDuplicate";
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

describe("buildDuplicateRegion", () => {
	for (const [kind, source] of Object.entries(sources)) {
		it(`${kind}: a separate item on its own row with the same time span`, () => {
			const others = [source, region("annotation-2", { trackIndex: 1 })];
			const copy = buildDuplicateRegion(source, others, "annotation-9", 10);
			expect(copy.id).toBe("annotation-9");
			expect(copy.id).not.toBe(source.id);
			expect(copy.startMs).toBe(source.startMs);
			expect(copy.endMs).toBe(source.endMs);
			// Row 0 and row 1 are taken: the copy gets row 2.
			expect(copy.trackIndex).toBe(2);
			expect(copy.zIndex).toBe(10);
			expect(copy.type).toBe(source.type);
			expect(copy.position.x).toBeCloseTo(source.position.x + DUPLICATE_OFFSET_PERCENT);
			expect(copy.position.y).toBeCloseTo(source.position.y + DUPLICATE_OFFSET_PERCENT);
			expect(copy.size).toEqual(source.size);
		});
	}

	it("keeps the content of each layer type", () => {
		expect(buildDuplicateRegion(sources.text, [], "x", 1).content).toBe("Hello");
		expect(buildDuplicateRegion(sources.image, [], "x", 1)).toMatchObject({
			content: "data:image/png;base64,AAA",
			imageFileName: "a.png",
		});
		expect(buildDuplicateRegion(sources.shape, [], "x", 1).shapeData).toEqual(DEFAULT_SHAPE_DATA);
		expect(buildDuplicateRegion(sources.arrow, [], "x", 1).figureData).toEqual(DEFAULT_FIGURE_DATA);
		expect(buildDuplicateRegion(sources.blur, [], "x", 1)).toMatchObject({
			blurIntensity: 30,
			blurColor: "#000000",
		});
	});

	it("shares no nested objects with the original, so editing the copy leaves it alone", () => {
		const copy = buildDuplicateRegion(sources.shape, [], "x", 1);
		expect(copy.style).not.toBe(sources.shape.style);
		expect(copy.shapeData).not.toBe(sources.shape.shapeData);
		expect(copy.position).not.toBe(sources.shape.position);
		copy.style.color = "#123456";
		expect(sources.shape.style.color).not.toBe("#123456");
	});

	it("starts on row 0 when the original has no track index and nothing else exists", () => {
		const bare = { ...sources.text, trackIndex: undefined };
		expect(buildDuplicateRegion(bare, [bare], "x", 1).trackIndex).toBe(1);
		expect(buildDuplicateRegion(bare, [], "x", 1).trackIndex).toBe(0);
	});
});
