import type { AnnotationRegion, AnnotationTextStyle, TextRun, TextRunStyle } from "./types";

/**
 * Rich text helpers. A text layer's content is a list of runs, each with sparse overrides of the
 * layer style. Every helper is pure, keeps the runs' text equal to the plain content, and returns
 * normalised runs: no empty runs, no overrides equal to the layer style, adjacent equal runs merged.
 */

export const TEXT_RUN_STYLE_KEYS = [
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"color",
	"fontFamily",
	"fontSize",
	"highlight",
] as const satisfies readonly (keyof TextRunStyle)[];

export type TextRunStyleKey = (typeof TEXT_RUN_STYLE_KEYS)[number];

/** A run's style with every key resolved against the layer style. */
export type ResolvedTextStyle = Required<Omit<TextRunStyle, "highlight">> & { highlight?: string };

/** A style patch: a value sets the key, `undefined` (or "transparent" for highlight) clears it. */
export type TextStylePatch = { [K in TextRunStyleKey]?: TextRunStyle[K] | undefined };

/** Marks a key whose value differs across the queried text. */
export const MIXED = Symbol("mixed");
export type MixedValue<T> = T | typeof MIXED;
export type TextStyleSummary = { [K in TextRunStyleKey]: MixedValue<ResolvedTextStyle[K]> };

type LayerStyle = Pick<
	AnnotationTextStyle,
	"fontWeight" | "fontStyle" | "textDecoration" | "color" | "fontFamily" | "fontSize"
>;

function isNoHighlight(value: unknown): boolean {
	return value === undefined || value === null || value === "" || value === "transparent";
}

/** Drops keys that are unset or equal to the layer style, so the run only stores real overrides. */
function cleanStyle(style: TextRunStyle | undefined, layer: LayerStyle | null): TextRunStyle {
	const clean: TextRunStyle = {};
	if (!style) return clean;
	for (const key of TEXT_RUN_STYLE_KEYS) {
		const value = style[key];
		if (key === "highlight") {
			if (!isNoHighlight(value)) clean.highlight = value as string;
			continue;
		}
		if (value === undefined || value === null) continue;
		if (layer && layer[key] === value) continue;
		(clean as Record<string, unknown>)[key] = value;
	}
	return clean;
}

function sameStyle(a: TextRunStyle, b: TextRunStyle): boolean {
	return TEXT_RUN_STYLE_KEYS.every((key) => a[key] === b[key]);
}

function isEmptyStyle(style: TextRunStyle): boolean {
	return TEXT_RUN_STYLE_KEYS.every((key) => style[key] === undefined);
}

/** Drop empty runs, clean styles, merge neighbours with equal styles. */
export function normalizeTextRuns(runs: TextRun[], layer: LayerStyle | null = null): TextRun[] {
	const result: TextRun[] = [];
	for (const run of runs) {
		if (!run || typeof run.text !== "string" || run.text.length === 0) continue;
		const style = cleanStyle(run.style, layer);
		const last = result[result.length - 1];
		if (last && sameStyle(last.style ?? {}, style)) {
			last.text += run.text;
			continue;
		}
		result.push(isEmptyStyle(style) ? { text: run.text } : { text: run.text, style });
	}
	return result;
}

/** Runs worth storing: undefined when no run overrides anything (one implicit run). */
export function compactTextRuns(runs: TextRun[], layer: LayerStyle): TextRun[] | undefined {
	const normalized = normalizeTextRuns(runs, layer);
	return normalized.some((run) => run.style && !isEmptyStyle(run.style)) ? normalized : undefined;
}

export function plainTextOf(runs: TextRun[]): string {
	return runs.map((run) => run.text).join("");
}

/** The layer's runs: its stored runs when they match the content, else one run of the content. */
export function runsOf(region: Pick<AnnotationRegion, "content" | "textRuns">): TextRun[] {
	const content = region.content ?? "";
	const stored = region.textRuns;
	if (Array.isArray(stored) && stored.length > 0 && plainTextOf(stored) === content) {
		return stored;
	}
	return content ? [{ text: content }] : [];
}

/** Split the runs so that `offset` falls on a run boundary; returns the new runs and that boundary's index. */
function splitAt(runs: TextRun[], offset: number): { runs: TextRun[]; index: number } {
	const result: TextRun[] = [];
	let position = 0;
	let index = -1;
	for (const run of runs) {
		const end = position + run.text.length;
		if (index === -1 && offset <= position) index = result.length;
		if (offset > position && offset < end) {
			const cut = offset - position;
			result.push({ ...run, text: run.text.slice(0, cut) });
			index = result.length;
			result.push({ ...run, text: run.text.slice(cut) });
		} else {
			result.push(run);
		}
		position = end;
	}
	if (index === -1) index = result.length;
	return { runs: result, index };
}

function clampRange(runs: TextRun[], start: number, end: number): [number, number] {
	const length = plainTextOf(runs).length;
	const a = Math.max(0, Math.min(length, Math.min(start, end)));
	const b = Math.max(0, Math.min(length, Math.max(start, end)));
	return [a, b];
}

function patchStyle(style: TextRunStyle | undefined, patch: TextStylePatch): TextRunStyle {
	const next: TextRunStyle = { ...(style ?? {}) };
	for (const key of TEXT_RUN_STYLE_KEYS) {
		if (!(key in patch)) continue;
		const value = patch[key];
		if (value === undefined || (key === "highlight" && isNoHighlight(value))) {
			delete next[key];
		} else {
			(next as Record<string, unknown>)[key] = value;
		}
	}
	return next;
}

/** Apply a style patch to the characters in [start, end), splitting and merging runs. */
export function applyStyleToRange(
	runs: TextRun[],
	start: number,
	end: number,
	patch: TextStylePatch,
	layer: LayerStyle | null = null,
): TextRun[] {
	const [a, b] = clampRange(runs, start, end);
	if (a === b) return normalizeTextRuns(runs, layer);
	const first = splitAt(runs, a);
	const second = splitAt(first.runs, b);
	const patched = second.runs.map((run, index) =>
		index >= first.index && index < second.index ? { ...run, style: patchStyle(run.style, patch) } : run,
	);
	return normalizeTextRuns(patched, layer);
}

export function resolveTextStyle(layer: LayerStyle, style: TextRunStyle | undefined): ResolvedTextStyle {
	return {
		fontWeight: style?.fontWeight ?? layer.fontWeight,
		fontStyle: style?.fontStyle ?? layer.fontStyle,
		textDecoration: style?.textDecoration ?? layer.textDecoration,
		color: style?.color ?? layer.color,
		fontFamily: style?.fontFamily ?? layer.fontFamily,
		fontSize: style?.fontSize ?? layer.fontSize,
		...(style?.highlight ? { highlight: style.highlight } : {}),
	};
}

/**
 * A text layer's runs with resolved styles, font sizes multiplied by `sizeScale` (pixels per base
 * pixel), plus the layer's own resolved style at that scale: the input of the shared layout.
 */
export function styledRunsOf(
	region: Pick<AnnotationRegion, "content" | "textRuns" | "style">,
	sizeScale: number,
): { runs: { text: string; style: ResolvedTextStyle }[]; base: ResolvedTextStyle } {
	const scaled = (style: ResolvedTextStyle): ResolvedTextStyle => ({ ...style, fontSize: style.fontSize * sizeScale });
	return {
		runs: runsOf(region).map((run) => ({ text: run.text, style: scaled(resolveTextStyle(region.style, run.style)) })),
		base: scaled(resolveTextStyle(region.style, undefined)),
	};
}

/** The style a character typed at `offset` takes: the character before it, else the one after. */
export function styleAtOffset(runs: TextRun[], offset: number): TextRunStyle | undefined {
	let position = 0;
	let after: TextRunStyle | undefined;
	for (const run of runs) {
		const end = position + run.text.length;
		if (offset > position && offset <= end) return run.style;
		if (offset <= position && after === undefined) after = run.style ?? {};
		position = end;
	}
	return after ?? runs[runs.length - 1]?.style;
}

/**
 * Every resolved style key over [start, end): a value when all characters agree, else MIXED.
 * An empty range (or empty text) reports the style a typed character would get.
 */
export function styleSummary(
	runs: TextRun[],
	layer: LayerStyle,
	start: number,
	end: number,
): TextStyleSummary {
	const [a, b] = clampRange(runs, start, end);
	const styles: ResolvedTextStyle[] = [];
	if (a === b) {
		styles.push(resolveTextStyle(layer, styleAtOffset(runs, a)));
	} else {
		let position = 0;
		for (const run of runs) {
			const runEnd = position + run.text.length;
			if (runEnd > a && position < b) styles.push(resolveTextStyle(layer, run.style));
			position = runEnd;
		}
	}
	const summary = {} as Record<TextRunStyleKey, unknown>;
	for (const key of TEXT_RUN_STYLE_KEYS) {
		const values = new Set(styles.map((style) => style[key]));
		summary[key] = values.size === 1 ? [...values][0] : MIXED;
	}
	return summary as TextStyleSummary;
}

/**
 * Replace [start, end) with `insert`. The inserted text takes the style of the character before
 * the edit (or, at the very start, the first replaced/following character), so typing continues
 * the surrounding style.
 */
export function editTextRuns(
	runs: TextRun[],
	start: number,
	end: number,
	insert: string,
	layer: LayerStyle | null = null,
): TextRun[] {
	const [a, b] = clampRange(runs, start, end);
	// At the very start there is no character before: use the first replaced one (offset 1), or
	// the first character after the caret when nothing is replaced (offset 0).
	const insertStyle = styleAtOffset(runs, a > 0 ? a : b > a ? 1 : 0);
	const first = splitAt(runs, a);
	const second = splitAt(first.runs, b);
	const before = second.runs.slice(0, first.index);
	const after = second.runs.slice(second.index);
	const inserted = insert ? [{ text: insert, ...(insertStyle ? { style: { ...insertStyle } } : {}) }] : [];
	return normalizeTextRuns([...before, ...inserted, ...after], layer);
}

/** The single edit (common prefix and suffix kept) that turns `before` into `after`. */
export function diffText(before: string, after: string): { start: number; end: number; insert: string } {
	let prefix = 0;
	const max = Math.min(before.length, after.length);
	while (prefix < max && before[prefix] === after[prefix]) prefix++;
	let suffix = 0;
	while (
		suffix < max - prefix &&
		before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
	) {
		suffix++;
	}
	return {
		start: prefix,
		end: before.length - suffix,
		insert: after.slice(prefix, after.length - suffix),
	};
}

/** Runs for new plain text, keeping the styles of the text that did not change. */
export function runsForNewText(runs: TextRun[], newText: string, layer: LayerStyle | null = null): TextRun[] {
	const edit = diffText(plainTextOf(runs), newText);
	return editTextRuns(runs, edit.start, edit.end, edit.insert, layer);
}

/** Multiply every run's font size override (the layer size is scaled by the caller). */
export function scaleRunFontSizes(runs: TextRun[], scale: (size: number) => number): TextRun[] {
	return runs.map((run) =>
		run.style?.fontSize === undefined ? run : { ...run, style: { ...run.style, fontSize: scale(run.style.fontSize) } },
	);
}

/**
 * Runs read from a saved project: invalid entries and values are dropped, runs are normalised,
 * and anything that no longer matches the plain content falls back to none (one implicit run).
 */
export function sanitizeStoredTextRuns(raw: unknown, content: string, layer: LayerStyle): TextRun[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const runs: TextRun[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object" || typeof (item as TextRun).text !== "string") continue;
		const source = (item as TextRun).style;
		const style: TextRunStyle = {};
		if (source && typeof source === "object") {
			if (source.fontWeight === "bold" || source.fontWeight === "normal") style.fontWeight = source.fontWeight;
			if (source.fontStyle === "italic" || source.fontStyle === "normal") style.fontStyle = source.fontStyle;
			if (source.textDecoration === "underline" || source.textDecoration === "none") {
				style.textDecoration = source.textDecoration;
			}
			if (typeof source.color === "string") style.color = source.color;
			if (typeof source.fontFamily === "string" && source.fontFamily.trim()) style.fontFamily = source.fontFamily;
			if (typeof source.fontSize === "number" && Number.isFinite(source.fontSize) && source.fontSize > 0) {
				style.fontSize = source.fontSize;
			}
			if (typeof source.highlight === "string") style.highlight = source.highlight;
		}
		runs.push({ text: (item as TextRun).text, style });
	}
	if (plainTextOf(runs) !== content) return undefined;
	return compactTextRuns(runs, layer);
}

/** Layer keys a whole-layer change writes to the layer style (highlight lives only on runs). */
const LAYER_KEYS = ["fontWeight", "fontStyle", "textDecoration", "color", "fontFamily", "fontSize"] as const;

export type TextLayerFields = Pick<AnnotationRegion, "style" | "content" | "textRuns">;

/**
 * Apply a text style patch to a layer. With a non-empty range only those characters change;
 * otherwise the change covers the whole layer as before rich text: layer keys go to the layer
 * style and are cleared from every run (so the layer becomes uniform), highlight covers all text.
 */
export function applyTextStylePatch(
	region: TextLayerFields,
	patch: TextStylePatch,
	range: { start: number; end: number } | null,
): Pick<AnnotationRegion, "style" | "textRuns"> {
	const runs = runsOf(region);
	const length = plainTextOf(runs).length;
	if (range && range.end !== range.start) {
		const style = region.style;
		return { style, textRuns: compactTextRuns(applyStyleToRange(runs, range.start, range.end, patch, style), style) };
	}
	const layerPatch: Partial<AnnotationTextStyle> = {};
	const cleared: TextStylePatch = {};
	for (const key of LAYER_KEYS) {
		if (!(key in patch) || patch[key] === undefined) continue;
		(layerPatch as Record<string, unknown>)[key] = patch[key];
		cleared[key] = undefined;
	}
	const style = { ...region.style, ...layerPatch };
	let nextRuns = applyStyleToRange(runs, 0, length, cleared, style);
	if ("highlight" in patch) nextRuns = applyStyleToRange(nextRuns, 0, length, { highlight: patch.highlight }, style);
	return { style, textRuns: compactTextRuns(nextRuns, style) };
}
