import type { GeneratedClipRegion } from "../types";

/** The generated clip whose span currently covers this timeline moment, if any. */
export function findActiveGeneratedClip(
	regions: GeneratedClipRegion[],
	timelineMs: number,
): GeneratedClipRegion | null {
	return regions.find((region) => timelineMs >= region.startMs && timelineMs < region.endMs) ?? null;
}

/** Maps timeline time to the active clip's own media timestamp (it always starts at 0). */
export function getGeneratedClipTargetTimeSeconds(timelineMs: number, region: GeneratedClipRegion): number {
	return Math.max(0, (timelineMs - region.startMs) / 1000);
}

/**
 * Decides whether the active clip's video element needs a corrective seek,
 * mirroring the webcam overlay's drift tolerance (tighter while paused, since
 * a paused frame should land exactly where the playhead is).
 */
export function shouldSeekGeneratedClipMedia({
	desiredTime,
	currentTime,
	isPlaying,
}: {
	desiredTime: number;
	currentTime: number;
	isPlaying: boolean;
}): boolean {
	const driftThreshold = isPlaying ? 0.15 : 0.01;
	return Math.abs(currentTime - desiredTime) > driftThreshold;
}
