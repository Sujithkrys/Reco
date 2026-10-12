import { describe, expect, it } from "vitest";
import {
	type AnnotationRegion,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	type TextRun,
} from "@/components/video-editor/types";
import {
	canvasTextMeasurer,
	layoutRichTextBox,
	layoutTextBox,
	wrapTextLines,
} from "@/components/video-editor/annotationTextLayout";
import { styledRunsOf } from "@/components/video-editor/textRuns";
import { renderAnnotations } from "./annotationRenderer";

// Every character measures 10px at the default 20px (half the font size), so widths are easy to reason about.
const CHAR_WIDTH = 10;
const fontPx = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 20);

type Call = { name: string; args: unknown[]; font: string; fillStyle: string };

function createRecordingContext() {
	const calls: Call[] = [];
	const ctx = {
		font: "",
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 1,
		textAlign: "left",
		textBaseline: "alphabetic",
		measureText: (text: string) => ({ width: (text.length * fontPx(ctx.font)) / 2 }),
	} as Record<string, unknown> & { font: string; fillStyle: string };
	for (const name of ["save", "restore", "beginPath", "rect", "clip", "fill", "stroke", "moveTo", "lineTo", "roundRect", "fillText", "fillRect"]) {
		ctx[name] = (...args: unknown[]) => {
			calls.push({ name, args, font: ctx.font, fillStyle: String(ctx.fillStyle) });
		};
	}
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

const roundRects = (calls: Call[]) =>
	calls.filter((call) => call.name === "roundRect").map((call) => call.args as number[]);
const texts = (calls: Call[]) =>
	calls.filter((call) => call.name === "fillText").map((call) => call.args as [string, number, number]);
const textCalls = (calls: Call[]) => calls.filter((call) => call.name === "fillText");

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
		// Each line is centred on the box centre (drawn from its left edge: 250 - width / 2);
		// the two 28px lines sit evenly around its middle.
		expect(first[1]).toBeCloseTo(250 - 110 / 2);
		expect(second[1]).toBeCloseTo(250 - 20 / 2);
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

	it("renders a corner-resized text layer from its stored percent rect and font size", async () => {
		const { ctx, calls } = createRecordingContext();
		// The editor stores a 1.5× corner resize as percent of the video rect plus the
		// scaled font: 50%×50% at (10%, 20%) with 32px → 75%×75% at the same corner, 48px.
		const resized = {
			...textAnnotation("Hello world\nHi", { textAlign: "center", fontSize: 48 }),
			position: { x: 10, y: 20 },
			size: { width: 75, height: 75 },
		};

		await renderAnnotations(ctx, [resized], 1000, 500, 500, 1);

		expect(roundRects(calls)).toEqual([[100, 100, 750, 375, 4]]);
		expect(ctx.font).toContain("48px");
		const lines = texts(calls);
		// Centred on 475: "Hello world" is 11 × 24px wide, "Hi" 2 × 24px.
		expect(lines.map(([, x]) => x)).toEqual([475 - 132, 475 - 24]);
		// Two 48×1.4px lines, evenly around the box middle (100 + 375/2).
		expect(lines[0][2]).toBeCloseTo(287.5 - 33.6);
		expect(lines[1][2]).toBeCloseTo(287.5 + 33.6);
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

describe("export rich text", () => {
	// A 500x250 box at (0, 0) on a 1000x500 canvas; left-aligned text starts at 8px padding + 4px inset.
	const rich = (runs: TextRun[], style: Partial<AnnotationRegion["style"]> = {}): AnnotationRegion => ({
		...textAnnotation(runs.map((run) => run.text).join(""), { textAlign: "left", backgroundColor: "transparent", ...style }),
		textRuns: runs,
	});

	it("draws mixed sizes on one line on a shared baseline", async () => {
		const { ctx, calls } = createRecordingContext();
		await renderAnnotations(ctx, [rich([{ text: "ab " }, { text: "CD", style: { fontSize: 40 } }])], 1000, 500, 500, 1);

		const [small, large] = textCalls(calls);
		expect(small.args[0]).toBe("ab ");
		expect(small.font).toContain("20px");
		expect(large.args[0]).toBe("CD");
		expect(large.font).toContain("40px");
		// Side by side from the line start.
		expect(small.args[1]).toBeCloseTo(12);
		expect(large.args[1]).toBeCloseTo(12 + 30);
		// One 56px line (1.4 × 40) centred at 125: the large run is centred, the small run shares its
		// baseline (baseline 0.3em below the middle when the context reports no metrics).
		expect(large.args[2]).toBeCloseTo(125);
		expect(small.args[2]).toBeCloseTo(125 + 40 * 0.3 - 20 * 0.3);
	});

	it("draws each run in its own font, weight and colour", async () => {
		const { ctx, calls } = createRecordingContext();
		await renderAnnotations(
			ctx,
			[
				rich([
					{ text: "plain " },
					{ text: "serif", style: { fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "normal", color: "#ff0000" } },
				]),
			],
			1000,
			500,
			500,
			1,
		);

		const [plain, serif] = textCalls(calls);
		expect(plain.font).toBe(`normal bold 20px ${DEFAULT_ANNOTATION_STYLE.fontFamily}`);
		expect(plain.fillStyle).toBe(DEFAULT_ANNOTATION_STYLE.color);
		expect(serif.font).toBe("italic normal 20px Georgia, serif");
		expect(serif.fillStyle).toBe("#ff0000");
	});

	it("paints a highlight behind its run only", async () => {
		const { ctx, calls } = createRecordingContext();
		await renderAnnotations(
			ctx,
			[rich([{ text: "aa " }, { text: "bb", style: { highlight: "#ffff00" } }, { text: " cc" }])],
			1000,
			500,
			500,
			1,
		);

		const highlights = calls.filter((call) => call.name === "fillRect");
		expect(highlights).toHaveLength(1);
		expect(highlights[0].fillStyle).toBe("#ffff00");
		const [x, y, width, height] = highlights[0].args as number[];
		const bb = textCalls(calls).find((call) => call.args[0] === "bb");
		expect(x).toBeCloseTo(bb?.args[1] as number);
		expect(width).toBeCloseTo(20);
		// From the font ascent above the baseline to the descent below it (0.8em + 0.2em without metrics).
		expect(y).toBeCloseTo((bb?.args[2] as number) + 20 * 0.3 - 20 * 0.8);
		expect(height).toBeCloseTo(20);
	});

	it("breaks lines exactly where the preview layout does", async () => {
		const { ctx, calls } = createRecordingContext();
		const region = rich(
			[
				{ text: "Small words then " },
				{ text: "LARGE WORDS", style: { fontSize: 60 } },
				{ text: " and small words again until the box wraps" },
			],
			{ textAlign: "center" },
		);
		await renderAnnotations(ctx, [region], 1000, 500, 500, 1);

		// The preview lays text out with the same function and a canvas measurer.
		const { runs, base } = styledRunsOf(region, 1);
		const preview = layoutRichTextBox(
			runs,
			base,
			"center",
			{ x: 0, y: 0, width: 500, height: 250, scale: 1 },
			canvasTextMeasurer(createRecordingContext().ctx),
		);
		const previewLines = preview.lines.map((line) => line.pieces.map((piece) => piece.text).join(""));
		expect(previewLines.length).toBeGreaterThan(1);
		expect(textCalls(calls).map((call) => call.args[0]).join("|")).toBe(
			preview.lines.flatMap((line) => line.pieces.map((piece) => piece.text)).join("|"),
		);
		// Every line fits the 476px text width (500 - 2×8 padding - 2×4 inset).
		for (const line of preview.lines) expect(line.width).toBeLessThanOrEqual(476);
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
