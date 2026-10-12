import type { CSSProperties } from "react";
import type { StyledText } from "./annotationTextLayout";
import type { ResolvedTextStyle } from "./textRuns";

/** CSS for one run (font size already in pixels); a highlight is the span's own background. */
export function runCss(style: ResolvedTextStyle): CSSProperties {
	return {
		color: style.color,
		fontSize: `${style.fontSize}px`,
		fontFamily: style.fontFamily,
		fontWeight: style.fontWeight,
		fontStyle: style.fontStyle,
		textDecoration: style.textDecoration,
		backgroundColor: style.highlight || undefined,
	};
}

/**
 * Render runs into the canvas text editor as one span per run. Line breaks stay "\n" characters
 * (the editor is white-space: pre-wrap), so DOM text offsets are content offsets. A trailing
 * <br> gives the caret a line to sit on after a final newline or in an empty layer.
 */
export function renderRunsInto(root: HTMLElement, runs: StyledText[]) {
	const spans = runs.map((run) => {
		const span = document.createElement("span");
		span.textContent = run.text;
		Object.assign(span.style, runCss(run.style));
		return span;
	});
	const text = runs.map((run) => run.text).join("");
	root.replaceChildren(...spans);
	if (text === "" || text.endsWith("\n")) root.appendChild(document.createElement("br"));
}

/** The content offset of a DOM position inside `root` (characters of the text before it). */
export function offsetOf(root: HTMLElement, node: Node, offset: number): number {
	if (!root.contains(node)) return 0;
	const range = document.createRange();
	range.setStart(root, 0);
	range.setEnd(node, offset);
	return range.toString().length;
}

/** The DOM position of a content offset inside `root`. */
function positionOf(root: HTMLElement, target: number): { node: Node; offset: number } {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let consumed = 0;
	let last: Text | null = null;
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
		const length = node.data.length;
		if (target <= consumed + length) return { node, offset: target - consumed };
		consumed += length;
		last = node;
	}
	if (last) return { node: last, offset: last.data.length };
	return { node: root, offset: 0 };
}

/** A DOM range over content offsets [start, end) inside `root`. */
export function rangeOf(root: HTMLElement, start: number, end: number): Range {
	const range = document.createRange();
	const from = positionOf(root, Math.min(start, end));
	const to = positionOf(root, Math.max(start, end));
	range.setStart(from.node, from.offset);
	range.setEnd(to.node, to.offset);
	return range;
}

/** Select content offsets [start, end) inside `root` (a caret when they are equal). */
export function selectOffsets(root: HTMLElement, start: number, end: number) {
	const selection = window.getSelection();
	if (!selection) return;
	selection.removeAllRanges();
	selection.addRange(rangeOf(root, start, end));
}

/** The current DOM selection as content offsets, when it lies inside `root`. */
export function selectedOffsets(root: HTMLElement): { start: number; end: number } | null {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
	const start = offsetOf(root, range.startContainer, range.startOffset);
	const end = offsetOf(root, range.endContainer, range.endOffset);
	return { start: Math.min(start, end), end: Math.max(start, end) };
}

/** The editor's plain text as the DOM holds it (after an IME composition wrote into it). */
export function domText(root: HTMLElement): string {
	const range = document.createRange();
	range.selectNodeContents(root);
	return range.toString();
}

/** Offset of the previous / next code point (so a delete never splits a surrogate pair). */
export function previousCodePoint(text: string, offset: number): number {
	if (offset <= 0) return 0;
	const code = text.charCodeAt(offset - 1);
	return code >= 0xdc00 && code <= 0xdfff && offset >= 2 ? offset - 2 : offset - 1;
}

export function nextCodePoint(text: string, offset: number): number {
	if (offset >= text.length) return text.length;
	const code = text.charCodeAt(offset);
	return code >= 0xd800 && code <= 0xdbff && offset + 1 < text.length ? offset + 2 : offset + 1;
}

const SELECTION_HIGHLIGHT = "reco-text-selection";

/**
 * Show a remembered selection while focus is elsewhere (panel, colour popover) with the CSS
 * Custom Highlight API; null removes it. Browsers without the API simply show nothing.
 */
export function showRememberedSelection(range: Range | null) {
	const highlights = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
	const HighlightCtor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
	if (!highlights || !HighlightCtor) return;
	if (range) highlights.set(SELECTION_HIGHLIGHT, new HighlightCtor(range));
	else highlights.delete(SELECTION_HIGHLIGHT);
}
