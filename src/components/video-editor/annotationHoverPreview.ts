import { useSyncExternalStore } from "react";
import { applyTextStylePatch, scaleTextLayer, TEXT_RUN_STYLE_KEYS, type TextStylePatch } from "./textRuns";
import { textSelectionFor } from "./textSelectionStore";
import type { AnnotationRegion, FigureData, ShapeData } from "./types";

/**
 * Transient "what if" values shown on the canvas while the pointer rests on a
 * colour swatch or a font option. It lives only in this store: it is never part
 * of the project data, never goes through the edit history (so hovering adds no
 * undo steps), is never saved or autosaved, and the export reads the real
 * regions, so a hover value can never reach the exported video.
 */
export interface AnnotationPreviewPatch {
	style?: Partial<AnnotationRegion["style"]>;
	shapeData?: Partial<ShapeData>;
	figureData?: Partial<FigureData>;
	blurColor?: string;
	/** Used by the keyboard shortcuts to show held arrow / scale keys before they are committed. */
	position?: { x: number; y: number };
	size?: { width: number; height: number };
	/** Text style keys (colour, font, size, ...) apply to this range only; set from the active text selection. */
	textRange?: { start: number; end: number } | null;
	/** Run-only text keys (highlight) to preview. */
	textStyle?: TextStylePatch;
	/** Held Ctrl +/-: every font size of a text layer times this factor. */
	textScale?: number;
}

export interface AnnotationPreview {
	id: string;
	patch: AnnotationPreviewPatch;
}

let current: AnnotationPreview | null = null;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function previewAnnotation(id: string, patch: AnnotationPreviewPatch) {
	// A text selection on the canvas limits text style previews to that range, as the commit will.
	current = { id, patch: { ...patch, textRange: patch.textRange ?? textSelectionFor(id) } };
	emit();
}

export function clearAnnotationPreview() {
	if (!current) return;
	current = null;
	emit();
}

export function getAnnotationPreview(): AnnotationPreview | null {
	return current;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useAnnotationPreview(): AnnotationPreview | null {
	return useSyncExternalStore(subscribe, getAnnotationPreview, getAnnotationPreview);
}

/**
 * The style part of a preview. On a text layer the text keys go through the same patch as the
 * commit (the selected range only, or the whole layer), the rest (box background, alignment)
 * through the layer style.
 */
function previewStyle(
	region: AnnotationRegion,
	patch: AnnotationPreviewPatch,
): Pick<AnnotationRegion, "style" | "textRuns"> {
	if (region.type !== "text") return { style: { ...region.style, ...patch.style }, textRuns: region.textRuns };
	const textPatch: TextStylePatch = { ...patch.textStyle };
	const layerPatch: Partial<AnnotationRegion["style"]> = {};
	for (const [key, value] of Object.entries(patch.style ?? {})) {
		if ((TEXT_RUN_STYLE_KEYS as readonly string[]).includes(key)) {
			(textPatch as Record<string, unknown>)[key] = value;
		} else {
			(layerPatch as Record<string, unknown>)[key] = value;
		}
	}
	const withLayer = { ...region, style: { ...region.style, ...layerPatch } };
	return Object.keys(textPatch).length > 0
		? applyTextStylePatch(withLayer, textPatch, patch.textRange ?? null)
		: { style: withLayer.style, textRuns: region.textRuns };
}

/** The regions to draw in the editor preview: the real ones with the hover patch laid over one layer. */
export function applyAnnotationPreview(
	regions: AnnotationRegion[],
	preview: AnnotationPreview | null,
): AnnotationRegion[] {
	if (!preview) return regions;
	const { id, patch } = preview;
	if (!regions.some((region) => region.id === id)) return regions;
	return regions.map((region) => {
		if (region.id !== id) return region;
		const styled = patch.style || patch.textStyle ? { ...region, ...previewStyle(region, patch) } : region;
		return {
			...styled,
			...(patch.textScale !== undefined && region.type === "text" ? scaleTextLayer(styled, patch.textScale) : {}),
			...(patch.shapeData && region.shapeData
				? { shapeData: { ...region.shapeData, ...patch.shapeData } }
				: {}),
			...(patch.figureData && region.figureData
				? { figureData: { ...region.figureData, ...patch.figureData } }
				: {}),
			...(patch.blurColor !== undefined ? { blurColor: patch.blurColor } : {}),
						...(patch.position ? { position: patch.position } : {}),
						...(patch.size ? { size: patch.size } : {}),
		};
	});
}
