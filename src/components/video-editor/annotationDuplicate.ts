import type { AnnotationRegion } from "./types";

/** Offset of a duplicated layer from the original, percent of the video. */
export const DUPLICATE_OFFSET_PERCENT = 3;

/**
 * Ctrl+D: the layer list with a copy added. The copy keeps the original's time span and content
 * but is its own timeline item: a new id, on top in the stacking order, offset a little, and on
 * a new row directly above the original's row. Rows are drawn in trackIndex order from the top, so
 * the copy takes the original's index and the original and every layer on a later row move down one
 * row; layers on earlier rows stay where they are. No two layers end up sharing a row.
 */
export function duplicateRegionAbove(
	source: AnnotationRegion,
	regions: AnnotationRegion[],
	newId: string,
	zIndex: number,
): AnnotationRegion[] {
	const row = source.trackIndex ?? 0;
	const shifted = regions.map((region) =>
		(region.trackIndex ?? 0) >= row ? { ...region, trackIndex: (region.trackIndex ?? 0) + 1 } : region,
	);
	const copy = globalThis.structuredClone(source);
	copy.id = newId;
	copy.zIndex = zIndex;
	copy.trackIndex = row;
	copy.position = {
		x: source.position.x + DUPLICATE_OFFSET_PERCENT,
		y: source.position.y + DUPLICATE_OFFSET_PERCENT,
	};
	return [...shifted, copy];
}
