import { useSyncExternalStore } from "react";
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
	current = { id, patch };
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
		return {
			...region,
			...(patch.style ? { style: { ...region.style, ...patch.style } } : {}),
			...(patch.shapeData && region.shapeData
				? { shapeData: { ...region.shapeData, ...patch.shapeData } }
				: {}),
			...(patch.figureData && region.figureData
				? { figureData: { ...region.figureData, ...patch.figureData } }
				: {}),
			...(patch.blurColor !== undefined ? { blurColor: patch.blurColor } : {}),
		};
	});
}
