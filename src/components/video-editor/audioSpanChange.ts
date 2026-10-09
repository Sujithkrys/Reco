import { type AudioRegion, getAudioSourceStartMs } from "./types";

/**
 * Apply a timeline span change to an audio region.
 *
 * Moving (both edges shift by the same amount) keeps the source window. Dragging
 * an edge trims: the left edge advances `sourceStartMs` and cannot reach before
 * the start of the file; the right edge cannot pass the end of the file once its
 * length is known. With no known length the right edge is left unbounded.
 */
export function changeAudioSpan(
	region: AudioRegion,
	startMs: number,
	endMs: number,
	fileDurationMs?: number,
): AudioRegion {
	const sourceStart = getAudioSourceStartMs(region);
	const isMove = Math.abs(startMs - region.startMs - (endMs - region.endMs)) < 1;
	if (isMove) {
		return {
			...region,
			startMs: Math.round(startMs),
			endMs: Math.round(endMs),
			sourceStartMs: sourceStart,
		};
	}

	const start = Math.max(Math.round(startMs), Math.ceil(region.startMs - sourceStart));
	const sourceStartMs = Math.max(0, Math.round(sourceStart + (start - region.startMs)));
	const knownDurationMs =
		Number.isFinite(fileDurationMs) && (fileDurationMs as number) > 0
			? (fileDurationMs as number)
			: undefined;
	const end =
		knownDurationMs === undefined
			? Math.round(endMs)
			: Math.min(Math.round(endMs), Math.floor(start + (knownDurationMs - sourceStartMs)));

	return {
		...region,
		startMs: start,
		endMs: Math.max(start + 1, end),
		sourceStartMs,
		...(knownDurationMs === undefined ? {} : { sourceDurationMs: Math.round(knownDurationMs) }),
	};
}
