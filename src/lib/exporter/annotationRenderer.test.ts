import { describe, expect, it } from "vitest";
import {
	type AnnotationRegion,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
} from "@/components/video-editor/types";
import { layoutTextBox, wrapTextLines } from "@/components/video-editor/annotationTextLayout";
import { renderAnnotations } from "./annotationRenderer";

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

const roundRects = (calls: { name: string; args: unknown[] }[]) =>
	calls.filter((call) => call.name === "roundRect").map((call) => call.args as number[]);
const texts = (calls: { name: string; args: unknown[] }[]) =>
	calls.filter((call) => call.name === "fillText").map((call) => call.args as [string, number, number]);

describe("export text background", () => {
	it("fills the whole layer box with the 4px radius", async () => {
		const { ctx, calls } = createRecordingContext();

		// 50% of a 1000x500 canvas: a 500x250 box at (0, 0).
		await renderAnnotations(ctx, [textAnnotation("Hello world\nHi")], 1000, 500, 500, 1);

		expect(roundRects(calls)).toEqual([[0, 0, 500, 250, 4]]);
	});

	it("centres two-line text in the box", async () => {
		const { ctx, calls } = createRecordingContext();

		await renderAnnotations(
			ctx,
			[textAnnotation("Hello world\nHi", { textAlign: "center" })],
			1000,
			500,
			500,
			1,
		);

		const [first, second] = texts(calls);
		expect(texts(calls)).toHaveLength(2);
		// Horizontally on the box centre; the two 28px lines sit evenly around its middle.
		expect(first[1]).toBeCloseTo(250);
		expect(second[1]).toBeCloseTo(250);
		expect(first[2]).toBeCloseTo(125 - 14);
		expect(second[2]).toBeCloseTo(125 + 14);
	});

	it("grows the background with a larger box", async () => {
		const small = createRecordingContext();
		const large = createRecordingContext();
		const text = "Hello world\nHi";

		await renderAnnotations(small.ctx, [textAnnotation(text)], 1000, 500, 500, 1);
		const bigger = { ...textAnnotation(text), size: { width: 80, height: 80 } };
		await renderAnnotations(large.ctx, [bigger], 1000, 500, 500, 1);

		expect(roundRects(small.calls)[0]).toEqual([0, 0, 500, 250, 4]);
		expect(roundRects(large.calls)[0]).toEqual([0, 0, 800, 400, 4]);
		// Text size does not change with the box.
		expect(small.ctx.font).toBe(large.ctx.font);
	});

	it("draws no background without a background colour", async () => {
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

describe("text box layout", () => {
	const measure = (text: string) => text.length * CHAR_WIDTH;
	const box = { x: 0, y: 0, width: 200, height: 100, fontSize: 20, scale: 1 };

	it("wraps to the box width minus padding", () => {
		// Wrap width: 200 - 2×8 padding - 2×4 (0.2em) inset = 176px, i.e. 17 characters.
		const layout = layoutTextBox(measure, "aaaa bbbb cccc dddd eeee", "left", box);

		expect(layout.lines).toEqual(["aaaa bbbb cccc", "dddd eeee"]);
		expect(layout.textX).toBeCloseTo(12);
	});

	it("does not add a line for a trailing newline", () => {
		expect(layoutTextBox(measure, "Hello\n", "left", box).lines).toEqual(["Hello"]);
	});

	it("right-aligns against the box padding", () => {
		expect(layoutTextBox(measure, "Hi", "right", box).textX).toBeCloseTo(200 - 8 - 4);
	});

	it("breaks a word longer than the line", () => {
		expect(wrapTextLines(measure, "abcdefghij", 40)).toEqual(["abcd", "efgh", "ij"]);
	});

	it("keeps empty lines and drops spaces at a wrap", () => {
		expect(wrapTextLines(measure, "aa bb\n\ncc", 30)).toEqual(["aa", "bb", "", "cc"]);
	});
});
