import { useSyncExternalStore } from "react";

/**
 * The last non-collapsed text range selected in a text layer being edited on the canvas, as
 * character offsets into its content. It outlives the DOM selection on purpose: clicking the
 * settings panel or a colour popover moves focus away, but style changes must still apply to
 * that range. It is cleared when the caret collapses, on Esc, or when the layer changes.
 */
export interface TextSelection {
	annotationId: string;
	start: number;
	end: number;
}

let current: TextSelection | null = null;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function setTextSelection(selection: TextSelection | null) {
	const next = selection && selection.end !== selection.start ? selection : null;
	if (
		next === current ||
		(next &&
			current &&
			next.annotationId === current.annotationId &&
			next.start === current.start &&
			next.end === current.end)
	) {
		return;
	}
	current = next;
	emit();
}

export function clearTextSelection(annotationId?: string) {
	if (!current || (annotationId && current.annotationId !== annotationId)) return;
	current = null;
	emit();
}

export function getTextSelection(): TextSelection | null {
	return current;
}

/** The selected range in this layer, or null (no selection: changes apply to the whole layer). */
export function textSelectionFor(annotationId: string): { start: number; end: number } | null {
	return current && current.annotationId === annotationId ? { start: current.start, end: current.end } : null;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useTextSelection(): TextSelection | null {
	return useSyncExternalStore(subscribe, getTextSelection, getTextSelection);
}

/**
 * The selection of a plain textarea as a text range in the layer: character offsets into the same
 * text the canvas editor uses, ordered and clamped to the text. A caret (nothing selected) is null.
 */
export function textSelectionFromTextarea(
	annotationId: string,
	value: string,
	selectionStart: number | null,
	selectionEnd: number | null,
): TextSelection | null {
	if (selectionStart === null || selectionEnd === null) return null;
	const clampOffset = (offset: number) => Math.min(value.length, Math.max(0, Math.floor(offset)));
	const a = clampOffset(selectionStart);
	const b = clampOffset(selectionEnd);
	const start = Math.min(a, b);
	const end = Math.max(a, b);
	return start === end ? null : { annotationId, start, end };
}
