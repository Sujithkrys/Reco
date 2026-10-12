import type { ResolvedTextStyle } from "./textRuns";
import type { AnnotationRegion } from "./types";

/**
 * Text layer layout shared by the editor preview (AnnotationOverlay) and the
 * export renderer, so both wrap and place text identically. Sizes are in the
 * caller's pixels; `scale` converts the base sizes below (1920px-wide video).
 */
export const TEXT_BOX_PADDING = 8;
export const TEXT_BACKGROUND_RADIUS = 4;
export const TEXT_LINE_HEIGHT = 1.4;
/** Inset of the text inside the box padding, in em (horizontal, vertical). */
export const TEXT_INSET_X_EM = 0.2;
export const TEXT_INSET_Y_EM = 0.1;

type Measure = (text: string) => number;
/** Width of `[start, end)` of the laid-out text, whatever styles it spans. */
type MeasureRange = (start: number, end: number) => number;

export interface TextRange {
	start: number;
	end: number;
}

/** Code-point boundaries of `[start, end)` in `text` (so a surrogate pair is never split). */
function charBoundaries(text: string, start: number, end: number): number[] {
	const boundaries: number[] = [];
	let index = start;
	while (index < end) {
		const code = text.charCodeAt(index);
		index += code >= 0xd800 && code <= 0xdbff && index + 1 < end ? 2 : 1;
		boundaries.push(index);
	}
	return boundaries;
}

/** Split one over-long word into ranges that each fit `maxWidth` (at least one character each). */
function breakWord(text: string, measure: MeasureRange, start: number, end: number, maxWidth: number): TextRange[] {
	const pieces: TextRange[] = [];
	let pieceStart = start;
	let pieceEnd = start;
	for (const next of charBoundaries(text, start, end)) {
		if (pieceEnd > pieceStart && measure(pieceStart, next) > maxWidth) {
			pieces.push({ start: pieceStart, end: pieceEnd });
			pieceStart = pieceEnd;
		}
		pieceEnd = next;
	}
	if (pieceEnd > pieceStart) pieces.push({ start: pieceStart, end: pieceEnd });
	return pieces;
}

function trimEndIndex(text: string, start: number, end: number): number {
	let index = end;
	while (index > start && /\s/.test(text[index - 1])) index--;
	return index;
}

/**
 * Wrap text to `maxWidth` as ranges of the text: explicit newlines are kept, lines break between
 * words, and a word wider than the line breaks between characters. Trailing spaces at a break are
 * dropped (left out of the range), as CSS does for wrapped text.
 */
export function wrapTextRanges(text: string, measure: MeasureRange, maxWidth: number): TextRange[] {
	const rawLines: TextRange[] = [];
	let lineStart = 0;
	for (let index = 0; index <= text.length; index++) {
		if (index === text.length || text[index] === "\n") {
			rawLines.push({ start: lineStart, end: index });
			lineStart = index + 1;
		}
	}
	// A trailing newline adds no visible line.
	if (rawLines.length > 1 && rawLines[rawLines.length - 1].start === rawLines[rawLines.length - 1].end) {
		rawLines.pop();
	}

	const lines: TextRange[] = [];
	for (const raw of rawLines) {
		if (raw.start === raw.end) {
			lines.push({ start: raw.start, end: raw.start });
			continue;
		}
		let currentStart = raw.start;
		let currentEnd = raw.start;
		const tokenPattern = /\s+|\S+/g;
		const slice = text.slice(raw.start, raw.end);
		for (let match = tokenPattern.exec(slice); match; match = tokenPattern.exec(slice)) {
			const tokenStart = raw.start + match.index;
			const tokenEnd = tokenStart + match[0].length;
			const isSpace = /^\s+$/.test(match[0]);
			const empty = currentEnd === currentStart;
			if (empty || isSpace || measure(currentStart, trimEndIndex(text, currentStart, tokenEnd)) <= maxWidth) {
				if (empty && !isSpace && measure(tokenStart, tokenEnd) > maxWidth) {
					const pieces = breakWord(text, measure, tokenStart, tokenEnd, maxWidth);
					lines.push(...pieces.slice(0, -1));
					currentStart = pieces[pieces.length - 1].start;
				}
				currentEnd = tokenEnd;
				continue;
			}
			lines.push({ start: currentStart, end: trimEndIndex(text, currentStart, currentEnd) });
			if (measure(tokenStart, tokenEnd) > maxWidth) {
				const pieces = breakWord(text, measure, tokenStart, tokenEnd, maxWidth);
				lines.push(...pieces.slice(0, -1));
				currentStart = pieces[pieces.length - 1].start;
			} else {
				currentStart = tokenStart;
			}
			currentEnd = tokenEnd;
		}
		lines.push({ start: currentStart, end: trimEndIndex(text, currentStart, currentEnd) });
	}
	return lines;
}

/**
 * Wrap text to `maxWidth`: explicit newlines are kept, lines break between
 * words, and a word wider than the line breaks between characters. Trailing
 * spaces at a break are dropped, as CSS does for wrapped text.
 */
export function wrapTextLines(measure: Measure, content: string, maxWidth: number): string[] {
	return wrapTextRanges(content, (start, end) => measure(content.slice(start, end)), maxWidth).map((range) =>
		content.slice(range.start, range.end),
	);
}

/** One run of text with its fully resolved style; fontSize is in the caller's pixels. */
export interface StyledText {
	text: string;
	style: ResolvedTextStyle;
}

/** Vertical font metrics, in pixels, for one style. */
export interface FontMetrics {
	/** How far the alphabetic baseline sits below the em-box middle (canvas "middle" baseline). */
	middleToBaseline: number;
	/** Font ascent and descent from the baseline: the area a highlight covers (like a CSS inline background). */
	ascent: number;
	descent: number;
}

export interface TextMeasurer {
	width: (text: string, style: ResolvedTextStyle) => number;
	metrics: (style: ResolvedTextStyle) => FontMetrics;
}

export interface LaidOutPiece extends StyledText {
	x: number;
	width: number;
	/** Where to draw with textBaseline "middle": the pieces of a line share one alphabetic baseline. */
	middleY: number;
	baselineY: number;
}

export interface LaidOutLine extends TextRange {
	pieces: LaidOutPiece[];
	/** Style an empty line takes its height from (the text style at that point). */
	style: ResolvedTextStyle;
	top: number;
	height: number;
	width: number;
	x: number;
}

export interface RichTextLayout {
	lines: LaidOutLine[];
	/** The background fills the whole layer box. */
	background: { x: number; y: number; width: number; height: number; radius: number };
}

/** The canvas font string for a run style (fontSize already in pixels). */
export function textRunFont(style: Pick<ResolvedTextStyle, "fontStyle" | "fontWeight" | "fontSize" | "fontFamily">): string {
	const fontWeight = style.fontWeight === "bold" ? "bold" : "normal";
	const fontStyle = style.fontStyle === "italic" ? "italic" : "normal";
	return `${fontStyle} ${fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

/** Fallback metrics (em-box proportions) when the measuring context reports none. */
function approximateMetrics(fontSize: number): FontMetrics {
	return { middleToBaseline: fontSize * 0.3, ascent: fontSize * 0.8, descent: fontSize * 0.2 };
}

/** A measurer over a 2D canvas context; widths and metrics are cached per font. */
export function canvasTextMeasurer(
	ctx: Pick<CanvasRenderingContext2D, "measureText" | "font" | "textBaseline">,
): TextMeasurer {
	const metricsCache = new Map<string, FontMetrics>();
	return {
		width: (text, style) => {
			ctx.font = textRunFont(style);
			return ctx.measureText(text).width;
		},
		metrics: (style) => {
			const font = textRunFont(style);
			const cached = metricsCache.get(font);
			if (cached) return cached;
			const previousBaseline = ctx.textBaseline;
			ctx.font = font;
			ctx.textBaseline = "alphabetic";
			const alphabetic = ctx.measureText("Hg");
			ctx.textBaseline = "middle";
			const middle = ctx.measureText("Hg");
			ctx.textBaseline = previousBaseline;
			const fallback = approximateMetrics(style.fontSize);
			const offset = alphabetic.actualBoundingBoxAscent - middle.actualBoundingBoxAscent;
			const metrics: FontMetrics = {
				middleToBaseline: Number.isFinite(offset) ? offset : fallback.middleToBaseline,
				ascent: Number.isFinite(alphabetic.fontBoundingBoxAscent) ? alphabetic.fontBoundingBoxAscent : fallback.ascent,
				descent: Number.isFinite(alphabetic.fontBoundingBoxDescent)
					? alphabetic.fontBoundingBoxDescent
					: fallback.descent,
			};
			metricsCache.set(font, metrics);
			return metrics;
		},
	};
}

/**
 * Place rich text in a layer box: padded on all sides, wrapped to the box width, each line
 * aligned per textAlign, the block centred vertically. A line is as tall as its largest run
 * (1.4 line height) and its runs share the largest run's baseline. Insets use the layer's own
 * size. With one style this is exactly the single-style layout the app always had.
 */
export function layoutRichTextBox(
	runs: StyledText[],
	baseStyle: ResolvedTextStyle,
	textAlign: AnnotationRegion["style"]["textAlign"],
	box: { x: number; y: number; width: number; height: number; scale: number },
	measurer: TextMeasurer,
): RichTextLayout {
	const text = runs.map((run) => run.text).join("");
	const starts: number[] = [];
	let offset = 0;
	for (const run of runs) {
		starts.push(offset);
		offset += run.text.length;
	}
	const piecesIn = (start: number, end: number) => {
		const pieces: StyledText[] = [];
		runs.forEach((run, index) => {
			const runStart = starts[index];
			const a = Math.max(start, runStart);
			const b = Math.min(end, runStart + run.text.length);
			if (b > a) pieces.push({ text: run.text.slice(a - runStart, b - runStart), style: run.style });
		});
		return pieces;
	};
	const styleAt = (position: number): ResolvedTextStyle => {
		let found: ResolvedTextStyle | null = null;
		runs.forEach((run, index) => {
			const runStart = starts[index];
			if (found) return;
			// The character before the position, else the first after it.
			if (position > runStart && position <= runStart + run.text.length) found = run.style;
		});
		if (found) return found;
		const after = runs.find((run, index) => starts[index] >= position && run.text.length > 0);
		return after?.style ?? runs[runs.length - 1]?.style ?? baseStyle;
	};
	const measureRange: MeasureRange = (start, end) =>
		piecesIn(start, end).reduce((sum, piece) => sum + measurer.width(piece.text, piece.style), 0);

	const padding = TEXT_BOX_PADDING * box.scale;
	const insetX = baseStyle.fontSize * TEXT_INSET_X_EM;
	const insetY = baseStyle.fontSize * TEXT_INSET_Y_EM;
	const wrapWidth = Math.max(0, box.width - padding * 2 - insetX * 2);
	const ranges = wrapTextRanges(text, measureRange, wrapWidth);

	const lines = ranges.map((range) => {
		const styled = piecesIn(range.start, range.end).map((piece) => ({
			...piece,
			width: measurer.width(piece.text, piece.style),
		}));
		const style = styled[0]?.style ?? styleAt(range.start);
		const fontSize = styled.reduce((max, piece) => Math.max(max, piece.style.fontSize), styled.length ? 0 : style.fontSize);
		const width = styled.reduce((sum, piece) => sum + piece.width, 0);
		return { range, styled, style, height: fontSize * TEXT_LINE_HEIGHT, width };
	});

	const textHeight = lines.reduce((sum, line) => sum + line.height, 0) + insetY * 2;
	let top = box.y + box.height / 2 - textHeight / 2 + insetY;
	const laidOut: LaidOutLine[] = lines.map((line) => {
		const x =
			textAlign === "center"
				? box.x + box.width / 2 - line.width / 2
				: textAlign === "right"
					? box.x + box.width - padding - insetX - line.width
					: box.x + padding + insetX;
		const centerY = top + line.height / 2;
		// Anchor the shared baseline on the largest run: centred like a single-style line.
		const dominant = line.styled.reduce<StyledText | null>(
			(largest, piece) => (!largest || piece.style.fontSize > largest.style.fontSize ? piece : largest),
			null,
		);
		const baselineY = centerY + measurer.metrics(dominant?.style ?? line.style).middleToBaseline;
		let pieceX = x;
		const pieces: LaidOutPiece[] = line.styled.map((piece) => {
			const laid = {
				...piece,
				x: pieceX,
				middleY: baselineY - measurer.metrics(piece.style).middleToBaseline,
				baselineY,
			};
			pieceX += piece.width;
			return laid;
		});
		const result: LaidOutLine = {
			start: line.range.start,
			end: line.range.end,
			pieces,
			style: line.style,
			top,
			height: line.height,
			width: line.width,
			x,
		};
		top += line.height;
		return result;
	});

	return {
		lines: laidOut,
		background: {
			x: box.x,
			y: box.y,
			width: box.width,
			height: box.height,
			radius: TEXT_BACKGROUND_RADIUS * box.scale,
		},
	};
}

export interface TextBoxLayout {
	lines: string[];
	lineHeight: number;
	/** Anchor x for each line, read with the text's own alignment. */
	textX: number;
	/** Vertical centre of the first line. */
	firstLineY: number;
	/** The background fills the whole layer box. */
	background: { x: number; y: number; width: number; height: number; radius: number };
}

/**
 * Single-style layout (one run of `content` at `box.fontSize`): the lines, their height and
 * the anchor used with the text's own alignment.
 */
export function layoutTextBox(
	measure: Measure,
	content: string,
	textAlign: AnnotationRegion["style"]["textAlign"],
	box: { x: number; y: number; width: number; height: number; fontSize: number; scale: number },
): TextBoxLayout {
	const style: ResolvedTextStyle = {
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		color: "",
		fontFamily: "",
		fontSize: box.fontSize,
	};
	const layout = layoutRichTextBox(content ? [{ text: content, style }] : [], style, textAlign, box, {
		width: (text) => measure(text),
		metrics: () => ({ middleToBaseline: 0, ascent: 0, descent: 0 }),
	});
	const padding = TEXT_BOX_PADDING * box.scale;
	const insetX = box.fontSize * TEXT_INSET_X_EM;
	const lineHeight = box.fontSize * TEXT_LINE_HEIGHT;
	return {
		lines: layout.lines.map((line) => content.slice(line.start, line.end)),
		lineHeight,
		textX:
			textAlign === "center"
				? box.x + box.width / 2
				: textAlign === "right"
					? box.x + box.width - padding - insetX
					: box.x + padding + insetX,
		firstLineY: (layout.lines[0]?.top ?? box.y) + lineHeight / 2,
		background: layout.background,
	};
}

/** The canvas font string for a text layer at a given pixel size. */
export function textLayerFont(style: AnnotationRegion["style"], fontSizePx: number): string {
	return textRunFont({ ...style, fontSize: fontSizePx });
}

export function hasTextBackground(style: AnnotationRegion["style"]): boolean {
	return Boolean(style.backgroundColor) && style.backgroundColor !== "transparent";
}
