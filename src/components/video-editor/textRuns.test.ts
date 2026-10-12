import { describe, expect, it } from "vitest";
import {
	applyStyleToRange,
	applyTextStylePatch,
	compactTextRuns,
	diffText,
	editTextRuns,
	MIXED,
	normalizeTextRuns,
	plainTextOf,
	runsForNewText,
	runsOf,
	scaleRunFontSizes,
	styleSummary,
} from "./textRuns";
import { DEFAULT_ANNOTATION_STYLE, type TextRun } from "./types";

const layer = { ...DEFAULT_ANNOTATION_STYLE, color: "#ffffff", fontWeight: "normal" as const, fontSize: 32 };
const bold = { fontWeight: "bold" as const };
const red = { color: "#ff0000" };

describe("normalising runs", () => {
	it("drops empty runs, merges equal neighbours and clears overrides equal to the layer", () => {
		const runs: TextRun[] = [
			{ text: "ab", style: bold },
			{ text: "", style: red },
			{ text: "cd", style: { fontWeight: "bold" } },
			{ text: "ef", style: { color: "#ffffff" } },
		];
		expect(normalizeTextRuns(runs, layer)).toEqual([{ text: "abcd", style: bold }, { text: "ef" }]);
	});

	it("is not stored when nothing is overridden", () => {
		expect(compactTextRuns([{ text: "a" }, { text: "b", style: { color: "#ffffff" } }], layer)).toBeUndefined();
	});

	it("falls back to one run of the content when stored runs do not match it", () => {
		expect(runsOf({ content: "Hello", textRuns: [{ text: "Hell", style: bold }] })).toEqual([{ text: "Hello" }]);
		expect(runsOf({ content: "Hi", textRuns: [{ text: "Hi", style: bold }] })).toEqual([{ text: "Hi", style: bold }]);
		expect(runsOf({ content: "" })).toEqual([]);
	});
});

describe("applying a style to a range", () => {
	it("splits a run around the range", () => {
		expect(applyStyleToRange([{ text: "Hello world" }], 6, 11, bold, layer)).toEqual([
			{ text: "Hello " },
			{ text: "world", style: bold },
		]);
	});

	it("crosses run boundaries and merges the result", () => {
		const runs: TextRun[] = [{ text: "aa", style: red }, { text: "bb" }, { text: "cc", style: red }];
		expect(applyStyleToRange(runs, 1, 5, bold, layer)).toEqual([
			{ text: "a", style: red },
			{ text: "a", style: { ...red, ...bold } },
			{ text: "bb", style: bold },
			{ text: "c", style: { ...red, ...bold } },
			{ text: "c", style: red },
		]);
	});

	it("clears a key with undefined and keeps plain text unchanged", () => {
		const runs: TextRun[] = [{ text: "abc", style: { ...red, ...bold } }];
		const next = applyStyleToRange(runs, 0, 3, { color: undefined }, layer);
		expect(next).toEqual([{ text: "abc", style: bold }]);
		expect(plainTextOf(next)).toBe("abc");
	});

	it("treats a transparent highlight as no highlight", () => {
		const runs = applyStyleToRange([{ text: "abc" }], 0, 3, { highlight: "#ffff00" }, layer);
		expect(applyStyleToRange(runs, 1, 2, { highlight: "transparent" }, layer)).toEqual([
			{ text: "a", style: { highlight: "#ffff00" } },
			{ text: "b" },
			{ text: "c", style: { highlight: "#ffff00" } },
		]);
	});
});

describe("style at a selection", () => {
	const runs: TextRun[] = [{ text: "ab" }, { text: "cd", style: { ...bold, fontSize: 48 } }];

	it("reports shared values and MIXED where they differ", () => {
		const summary = styleSummary(runs, layer, 1, 3);
		expect(summary.fontWeight).toBe(MIXED);
		expect(summary.fontSize).toBe(MIXED);
		expect(summary.color).toBe("#ffffff");
		expect(summary.highlight).toBeUndefined();
	});

	it("reports one run's values inside it, and the typing style for a caret", () => {
		expect(styleSummary(runs, layer, 2, 4).fontSize).toBe(48);
		expect(styleSummary(runs, layer, 3, 3).fontWeight).toBe("bold");
		expect(styleSummary(runs, layer, 0, 0).fontWeight).toBe("normal");
	});
});

describe("editing text while keeping styles", () => {
	const runs: TextRun[] = [{ text: "Hello " }, { text: "world", style: bold }];

	it("typing continues the style of the character before the caret", () => {
		expect(editTextRuns(runs, 11, 11, "!", layer)).toEqual([{ text: "Hello " }, { text: "world!", style: bold }]);
		expect(editTextRuns(runs, 3, 3, "p", layer)).toEqual([{ text: "Helplo " }, { text: "world", style: bold }]);
	});

	it("inserting at the very start takes the first character's style", () => {
		const styled: TextRun[] = [{ text: "ab", style: red }];
		expect(editTextRuns(styled, 0, 0, "x", layer)).toEqual([{ text: "xab", style: red }]);
	});

	it("deletes across runs", () => {
		expect(editTextRuns(runs, 4, 8, "", layer)).toEqual([{ text: "Hell" }, { text: "rld", style: bold }]);
	});

	it("replaces across runs with the style before the range", () => {
		expect(editTextRuns(runs, 5, 8, "-", layer)).toEqual([{ text: "Hello-" }, { text: "rld", style: bold }]);
	});

	it("keeps line breaks as text", () => {
		expect(plainTextOf(editTextRuns(runs, 6, 6, "\n", layer))).toBe("Hello \nworld");
	});

	it("maps a textarea change onto the runs", () => {
		expect(diffText("Hello world", "Hello big world")).toEqual({ start: 6, end: 6, insert: "big " });
		expect(runsForNewText(runs, "Hi world", layer)).toEqual([{ text: "Hi " }, { text: "world", style: bold }]);
	});
});

describe("whole-layer and range patches on a layer", () => {
	const region = {
		content: "Hello world",
		style: layer,
		textRuns: [{ text: "Hello " }, { text: "world", style: { ...red, fontSize: 48 } }],
	};

	it("a range patch changes only those characters", () => {
		const next = applyTextStylePatch(region, bold, { start: 0, end: 5 });
		expect(next.style).toBe(layer);
		expect(next.textRuns).toEqual([
			{ text: "Hello", style: bold },
			{ text: " " },
			{ text: "world", style: { ...red, fontSize: 48 } },
		]);
	});

	it("no selection sets the layer style and clears that key from every run", () => {
		const next = applyTextStylePatch(region, { color: "#00ff00" }, null);
		expect(next.style.color).toBe("#00ff00");
		expect(next.textRuns).toEqual([{ text: "Hello " }, { text: "world", style: { fontSize: 48 } }]);
	});

	it("a uniform result needs no runs, so the data matches an old project", () => {
		const next = applyTextStylePatch(region, { color: "#00ff00", fontSize: 40 }, null);
		expect(next.textRuns).toBeUndefined();
		expect(next.style.fontSize).toBe(40);
	});

	it("highlight with no selection covers all text", () => {
		const next = applyTextStylePatch({ content: "ab", style: layer }, { highlight: "#ffff00" }, null);
		expect(next.textRuns).toEqual([{ text: "ab", style: { highlight: "#ffff00" } }]);
	});
});

describe("scaling font sizes", () => {
	it("multiplies every run override", () => {
		const runs: TextRun[] = [{ text: "a" }, { text: "b", style: { fontSize: 20 } }];
		expect(scaleRunFontSizes(runs, (size) => size * 2)).toEqual([{ text: "a" }, { text: "b", style: { fontSize: 40 } }]);
	});
});
