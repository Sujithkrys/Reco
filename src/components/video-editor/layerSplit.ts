import {
	type AnnotationRegion,
	type AudioRegion,
	getAudioSourceStartMs,
	type ZoomRegion,
} from "./types";

export interface LayerSplit<T> {
	/** The first half keeps the original id, so a selected layer stays selected. */
	left: T;
	right: T;
}

interface TimedItem {
	id: string;
	startMs: number;
	endMs: number;
}

/** Split point in ms, or null when the playhead is not strictly inside the item. */
function resolveSplitMs(item: TimedItem, atMs: number): number | null {
	if (!Number.isFinite(atMs)) return null;
	const splitMs = Math.round(atMs);
	return splitMs > item.startMs && splitMs < item.endMs ? splitMs : null;
}

function splitTimed<T extends TimedItem>(
	item: T,
	atMs: number,
	createId: () => string,
	adjustRight: (right: T, leftLengthMs: number) => T = (right) => right,
): LayerSplit<T> | null {
	const splitMs = resolveSplitMs(item, atMs);
	if (splitMs === null) return null;
	const left = { ...item, endMs: splitMs };
	const right = adjustRight({ ...item, id: createId(), startMs: splitMs }, splitMs - item.startMs);
	return { left, right };
}

/** Split a text/image/shape/arrow/blur layer; both halves keep the same content and style. */
export function splitAnnotationAt(
	region: AnnotationRegion,
	atMs: number,
	createId: () => string,
): LayerSplit<AnnotationRegion> | null {
	return splitTimed(region, atMs, createId);
}

/** Split a zoom into two zooms with the same depth, focus and mode. */
export function splitZoomAt(
	region: ZoomRegion,
	atMs: number,
	createId: () => string,
): LayerSplit<ZoomRegion> | null {
	return splitTimed(region, atMs, createId);
}

/** Split audio; the second half keeps reading the file where the first half stops. */
export function splitAudioAt(
	region: AudioRegion,
	atMs: number,
	createId: () => string,
): LayerSplit<AudioRegion> | null {
	return splitTimed(region, atMs, createId, (right, leftLengthMs) => ({
		...right,
		sourceStartMs: getAudioSourceStartMs(region) + leftLengthMs,
	}));
}

/** Replace `id` in `items` with the two halves of a split, keeping order. */
export function replaceWithSplit<T extends { id: string }>(
	items: T[],
	id: string,
	split: LayerSplit<T>,
): T[] {
	return items.flatMap((item) => (item.id === id ? [split.left, split.right] : [item]));
}
