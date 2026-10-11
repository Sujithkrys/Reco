import type { AnnotationRegion } from "./types";

/** Offset of a duplicated layer from the original, percent of the video. */
export const DUPLICATE_OFFSET_PERCENT = 3;

/**
 * A copy of a layer for Ctrl+D. It keeps the original's time span and content but is its own
 * timeline item: a new id, on top in the stacking order, and on its own row. A copy that kept
 * the original's trackIndex would sit on the same row over the same time span, hidden behind it.
 */
export function buildDuplicateRegion(
	source: AnnotationRegion,
	regions: AnnotationRegion[],
	newId: string,
	zIndex: number,
): AnnotationRegion {
	const copy = globalThis.structuredClone(source);
	const nextTrack = regions.reduce((max, region) => Math.max(max, region.trackIndex ?? 0), -1) + 1;
	copy.id = newId;
	copy.zIndex = zIndex;
	copy.trackIndex = nextTrack;
	copy.position = {
		x: source.position.x + DUPLICATE_OFFSET_PERCENT,
		y: source.position.y + DUPLICATE_OFFSET_PERCENT,
	};
	return copy;
}
