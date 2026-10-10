import { describe, expect, it } from "vitest";
import {
	type AnnotationRegion,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
} from "@/components/video-editor/types";
import { layoutTextBlock, renderAnnotations } from "./annotationRenderer";

// Every character measures 10px, so widths are easy to reason about.
const CHAR_WIDTH = 10;

function createRecordingContext() {
	const calls: { name: string; args: unknown[] }[] = [];
	const record =
		(name: string) =>
		(...args: unknown[]) => {
			calls.push({ name, args });
		};
	const ctx = {
		font: "",
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 1,
		textAlign: "left",
		textBaseline: "alphabetic",
		save: record("save"),
		restore: record("restore"),
		beginPath: record("beginPath"),
		rect: record("rect"),
		clip: record("clip"),
		fill: record("fill"),
		stroke: record("stroke"),
		moveTo: record("moveTo"),
		lineTo: record("lineTo"),
		roundRect: record("roundRect"),
		fillText: record("fillText"),
		measureText: (text: string) => ({ width: text.length * CHAR_WIDTH }),
	};
	return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function textAnnotation(content: string, style: Partial<AnnotationRegion["style"]> = {}): AnnotationRegion {
	return {
		id: "text-1",
		startMs: 0,
		endMs: 1000,
		type: "text",
		content,
		position: { ...DEFAULT_ANNOTATION_POSITION, x: 0, y: 0 },
		size: { ...DEFAULT_ANNOTATION_SIZE, width: 50, height: 50 },
		style: { ...DEFAULT_ANNOTATION_STYLE, fontSize: 20, backgroundColor: "#000000", ...style },
		zIndex: 1,
	};
}

describe("export text background", () => {
	it("draws one block behind all lines, as wide as the widest line", async () => {
		const { ctx, calls } = createRecordingContext();

		// 50% of a 1000x500 canvas: a 500x250 box at (0, 0).
		await renderAnnotations(ctx, [textAnnotation("Hello world\nHi")], 1000, 500, 500, 1);

		const blocks = calls.filter((call) => call.name === "roundRect");
		expect(blocks).toHaveLength(1);
		const [x, y, width, height] = blocks[0].args as number[];
		// Widest line 110px + 0.2em (4px) padding each side; 2 lines × 28px + 0.1em (2px) each side.
		expect(width).toBeCloseTo(118);
		expect(height).toBeCloseTo(60);
		// Centred text: the block is centred in the box, vertically and horizontally.
		expect(x).toBeCloseTo(250 - 59);
		expect(y).toBeCloseTo(125 - 30);
		expect(calls.filter((call) => call.name === "fillText")).toHaveLength(2);
	});

	it("covers an empty middle line inside the same block", async () => {
		const { ctx, calls } = createRecordingContext();

		await renderAnnotations(ctx, [textAnnotation("One\n\nThree")], 1000, 500, 500, 1);

		const blocks = calls.filter((call) => call.name === "roundRect");
		expect(blocks).toHaveLength(1);
		expect((blocks[0].args as number[])[3]).toBeCloseTo(3 * 28 + 4);
	});

	it("draws no block without a background colour", async () => {
		const { ctx, calls } = createRecordingContext();

		await renderAnnotations(
			ctx,
			[textAnnotation("Hello\nworld", { backgroundColor: "transparent" })],
			1000,
			500,
			500,
			1,
		);

		expect(calls.filter((call) => call.name === "roundRect")).toHaveLength(0);
		expect(calls.filter((call) => call.name === "fillText")).toHaveLength(2);
	});
});

describe("text block layout", () => {
	const measure = { measureText: (text: string) => ({ width: text.length * CHAR_WIDTH }) };
	const box = { x: 0, y: 0, width: 200, height: 100, fontSize: 20, scaleFactor: 1 };

	it("caps the block at the box width when text wraps", () => {
		// Wrap width: 200 - 2×8 padding - 2×4 block padding = 176px.
		const layout = layoutTextBlock(measure, "aaaa bbbb cccc dddd eeee", "left", box);

		expect(layout.lines.length).toBeGreaterThan(1);
		expect(layout.block.width).toBeCloseTo(176 + 8);
		expect(layout.block.x).toBeCloseTo(8);
		expect(layout.textX).toBeCloseTo(12);
	});

	it("does not add a line for a trailing newline", () => {
		expect(layoutTextBlock(measure, "Hello\n", "left", box).lines).toEqual(["Hello"]);
	});

	it("right-aligns the block against the box padding", () => {
		const layout = layoutTextBlock(measure, "Hi", "right", box);

		expect(layout.block.x + layout.block.width).toBeCloseTo(200 - 8);
		expect(layout.textX).toBeCloseTo(200 - 8 - 4);
	});
});
