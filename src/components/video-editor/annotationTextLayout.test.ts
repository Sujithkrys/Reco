import { describe, expect, it } from "vitest";
import { layoutRichTextBox, type TextMeasurer, wrapTextLines, wrapTextRanges } from "./annotationTextLayout";
import type { ResolvedTextStyle } from "./textRuns";

// Each character is half its font size wide; the baseline sits 0.3em below the em middle.
const measurer: TextMeasurer = {
	width: (text, style) => text.length * style.fontSize * 0.5,
	metrics: (style) => ({ middleToBaseline: style.fontSize * 0.3, ascent: style.fontSize * 0.8, descent: style.fontSize * 0.2 }),
};
const base: ResolvedTextStyle = {
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	color: "#ffffff",
	fontFamily: "sans-serif",
	fontSize: 20,
};
const big = { ...base, fontSize: 40 };
// A 200x200 box at the origin; with 8px padding and a 4px (0.2em of 20px) inset the text is 176px wide.
const box = { x: 0, y: 0, width: 200, height: 200, scale: 1 };

describe("rich text wrapping", () => {
	it("wraps exactly like single-style text when there is one style", () => {
		const content = "aaaa bbbb cccc dddd";
		const single = wrapTextLines((text) => text.length * 10, content, 100);
		const ranges = wrapTextRanges(content, (start, end) => (end - start) * 10, 100);
		expect(ranges.map((range) => content.slice(range.start, range.end))).toEqual(single);
	});

	it("measures every run in its own size, so a larger run wraps sooner", () => {
		// "aaaa " is 50px at 20px; "BBBB" at 40px is 80px; "cccc" would add 5+40px → 175px fits the 176px line.
		const fits = layoutRichTextBox(
			[{ text: "aaaa ", style: base }, { text: "BBBB", style: big }, { text: " cc", style: base }],
			base,
			"left",
			box,
			measurer,
		);
		expect(fits.lines.map((line) => [line.start, line.end])).toEqual([[0, 12]]);
		// One more large character no longer fits: the line breaks before "cc".
		const breaks = layoutRichTextBox(
			[{ text: "aaaa ", style: base }, { text: "BBBBB", style: big }, { text: " cc", style: base }],
			base,
			"left",
			box,
			measurer,
		);
		expect(breaks.lines.map((line) => [line.start, line.end])).toEqual([[0, 10], [11, 13]]);
	});
});

describe("rich text lines", () => {
	const layout = layoutRichTextBox(
		[{ text: "ab", style: base }, { text: "CD", style: big }, { text: "\nef", style: base }],
		base,
		"left",
		box,
		measurer,
	);
	const [first, second] = layout.lines;

	it("makes a line as tall as its largest run", () => {
		expect(first.height).toBeCloseTo(40 * 1.4);
		expect(second.height).toBeCloseTo(20 * 1.4);
	});

	it("puts the runs of a line on one baseline, anchored on the largest run", () => {
		const [small, large] = first.pieces;
		expect(small.baselineY).toBe(large.baselineY);
		// The large run is centred in its line; the small one moves down to share its baseline.
		expect(large.middleY).toBeCloseTo(first.top + first.height / 2);
		expect(small.middleY).toBeCloseTo(large.baselineY - 20 * 0.3);
	});

	it("places runs side by side from the line start", () => {
		const [small, large] = first.pieces;
		expect(small.x).toBeCloseTo(12);
		expect(large.x).toBeCloseTo(12 + 20);
		expect(first.width).toBeCloseTo(20 + 40);
	});

	it("centres the whole block vertically", () => {
		const total = 40 * 1.4 + 20 * 1.4 + 2 * 2;
		expect(first.top).toBeCloseTo(100 - total / 2 + 2);
		expect(second.top).toBeCloseTo(first.top + first.height);
	});

	it("an empty line takes the size of the text around it", () => {
		const empty = layoutRichTextBox(
			[{ text: "a\n", style: big }, { text: "\nb", style: base }],
			base,
			"center",
			box,
			measurer,
		);
		expect(empty.lines.map((line) => line.height)).toEqual([40 * 1.4, 40 * 1.4, 20 * 1.4]);
	});
});
