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

/** Split one over-long word into pieces that each fit `maxWidth` (at least one character each). */
function breakWord(measure: Measure, word: string, maxWidth: number): string[] {
	const pieces: string[] = [];
	let current = "";
	for (const char of word) {
		if (current && measure(current + char) > maxWidth) {
			pieces.push(current);
			current = char;
		} else {
			current += char;
		}
	}
	if (current) pieces.push(current);
	return pieces;
}

/**
 * Wrap text to `maxWidth`: explicit newlines are kept, lines break between
 * words, and a word wider than the line breaks between characters. Trailing
 * spaces at a break are dropped, as CSS does for wrapped text.
 */
export function wrapTextLines(measure: Measure, content: string, maxWidth: number): string[] {
	const rawLines = content.split("\n");
	// A trailing newline adds no visible line.
	if (rawLines.length > 1 && rawLines[rawLines.length - 1] === "") rawLines.pop();

	const lines: string[] = [];
	for (const rawLine of rawLines) {
		if (!rawLine) {
			lines.push("");
			continue;
		}
		let current = "";
		for (const token of rawLine.split(/(\s+)/)) {
			if (!token) continue;
			const isSpace = /^\s+$/.test(token);
			const test = current + token;
			if (!current || isSpace || measure(test.trimEnd()) <= maxWidth) {
				if (!current && !isSpace && measure(token) > maxWidth) {
					const pieces = breakWord(measure, token, maxWidth);
					lines.push(...pieces.slice(0, -1));
					current = pieces[pieces.length - 1];
				} else {
					current = test;
				}
				continue;
			}
			lines.push(current.trimEnd());
			if (measure(token) > maxWidth) {
				const pieces = breakWord(measure, token, maxWidth);
				lines.push(...pieces.slice(0, -1));
				current = pieces[pieces.length - 1];
			} else {
				current = token;
			}
		}
		lines.push(current.trimEnd());
	}
	return lines;
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
 * Place text in a layer box: padded on all sides, wrapped to the box width,
 * aligned per textAlign and centred vertically. The background (if any) is the
 * box itself, so resizing the box resizes the background.
 */
export function layoutTextBox(
	measure: Measure,
	content: string,
	textAlign: AnnotationRegion["style"]["textAlign"],
	box: { x: number; y: number; width: number; height: number; fontSize: number; scale: number },
): TextBoxLayout {
	const padding = TEXT_BOX_PADDING * box.scale;
	const insetX = box.fontSize * TEXT_INSET_X_EM;
	const insetY = box.fontSize * TEXT_INSET_Y_EM;
	const lineHeight = box.fontSize * TEXT_LINE_HEIGHT;
	const wrapWidth = Math.max(0, box.width - padding * 2 - insetX * 2);
	const lines = wrapTextLines(measure, content, wrapWidth);

	const textHeight = lines.length * lineHeight + insetY * 2;
	const textTop = box.y + box.height / 2 - textHeight / 2;
	const textX =
		textAlign === "center"
			? box.x + box.width / 2
			: textAlign === "right"
				? box.x + box.width - padding - insetX
				: box.x + padding + insetX;

	return {
		lines,
		lineHeight,
		textX,
		firstLineY: textTop + insetY + lineHeight / 2,
		background: {
			x: box.x,
			y: box.y,
			width: box.width,
			height: box.height,
			radius: TEXT_BACKGROUND_RADIUS * box.scale,
		},
	};
}

/** The canvas font string for a text layer at a given pixel size. */
export function textLayerFont(style: AnnotationRegion["style"], fontSizePx: number): string {
	const fontWeight = style.fontWeight === "bold" ? "bold" : "normal";
	const fontStyle = style.fontStyle === "italic" ? "italic" : "normal";
	return `${fontStyle} ${fontWeight} ${fontSizePx}px ${style.fontFamily}`;
}

export function hasTextBackground(style: AnnotationRegion["style"]): boolean {
	return Boolean(style.backgroundColor) && style.backgroundColor !== "transparent";
}
