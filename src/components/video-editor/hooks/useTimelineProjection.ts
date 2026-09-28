/* biome-ignore-all lint/correctness/useExhaustiveDependencies: mutable timeline bootstrap refs intentionally do not trigger effects. */
import { type MutableRefObject, useCallback, useEffect, useMemo } from "react";
import { projectCaptionCues } from "../captionTimeline";
import { deriveNextId } from "../projectPersistence";
import type { useTimelineState } from "../state/useTimelineState";
import {
	clipsToTrims,
	extendAutoFullTrackClip,
	getClipSourceEndMs,
	getClipSourceStartMs,
	getTimelineDurationMs,
	mapSourceTimeToTimelineTime,
	mapTimelineTimeToSourceTime,
	type SpeedRegion,
	trimsToClips,
	type ZoomRegion,
} from "../types";

type Input = {
	timeline: ReturnType<typeof useTimelineState>;
	duration: number;
	currentTime: number;
	nextClipIdRef: MutableRefObject<number>;
	initializedRef: MutableRefObject<boolean>;
	autoFullTrackIdRef: MutableRefObject<string | null>;
	autoFullTrackEndRef: MutableRefObject<number | null>;
};

export function useTimelineProjection({
	timeline,
	duration,
	currentTime,
	nextClipIdRef,
	initializedRef,
	autoFullTrackIdRef,
	autoFullTrackEndRef,
}: Input) {
	const { clipRegions, trimRegions, speedRegions, zoomRegions, autoCaptions, generatedClipRegions } =
		timeline;

	useEffect(() => {
		const totalMs = Math.round(duration * 1000);
		if (totalMs <= 0) return;
		if (!initializedRef.current) {
			if (clipRegions.length === 0) {
				const nextRegions =
					trimRegions.length > 0
						? trimsToClips(trimRegions, totalMs)
						: (() => {
								const id = `clip-${nextClipIdRef.current++}`;
								autoFullTrackIdRef.current = id;
								autoFullTrackEndRef.current = totalMs;
								return [{ id, startMs: 0, endMs: totalMs, speed: 1 as const }];
							})();
				if (trimRegions.length > 0) {
					nextClipIdRef.current = deriveNextId(
						"clip",
						nextRegions.map(({ id }) => id),
					);
				}
				timeline.setClipRegions(nextRegions);
			}
			initializedRef.current = true;
			return;
		}

		const extended = extendAutoFullTrackClip(
			clipRegions,
			autoFullTrackIdRef.current,
			autoFullTrackEndRef.current,
			totalMs,
		);
		if (!extended) return;
		autoFullTrackEndRef.current = totalMs;
		timeline.setClipRegions(extended);
	}, [duration, clipRegions, trimRegions, nextClipIdRef, timeline.setClipRegions]);

	useEffect(() => {
		const totalMs = Math.round(duration * 1000);
		if (totalMs > 0 && clipRegions.length > 0) {
			timeline.setTrimRegions(clipsToTrims(clipRegions, totalMs));
		}
	}, [clipRegions, duration, timeline.setTrimRegions]);

	const toSourceTime = useCallback(
		(timeMs: number) => mapTimelineTimeToSourceTime(timeMs, clipRegions),
		[clipRegions],
	);
	const toTimelineTime = useCallback(
		(timeMs: number) => mapSourceTimeToTimelineTime(timeMs, clipRegions),
		[clipRegions],
	);
	const effectiveZoomRegions: ZoomRegion[] = zoomRegions;
	const effectiveCaptionRegions = useMemo(
		() => projectCaptionCues(autoCaptions, clipRegions),
		[autoCaptions, clipRegions],
	);
	const timelinePlayheadTime = currentTime;
	const timelineDuration = useMemo(() => {
		// A project with no main recording (nothing imported/recorded yet) has
		// clipRegions: [] and duration: 0, which used to make this always 0 --
		// generated clips have nowhere to be shown since the whole timeline UI
		// gates on this being non-zero. Falling back to the furthest generated
		// clip's own end time lets a project built entirely from AI-generated
		// clips work the same way a recording-based one does.
		// Defensive: an empty video src reports its duration as NaN, not 0 (the
		// main source of this is already guarded where duration comes from, but
		// Math.max(NaN, x) is always NaN, silently breaking this computation the
		// same way 0 would look "already handled" while actually producing a
		// falsy-but-wrong result) -- never let a non-finite duration in here.
		const safeDurationMs = Number.isFinite(duration) ? duration * 1000 : 0;
		const baseDurationMs = getTimelineDurationMs(clipRegions, safeDurationMs);
		const generatedClipsEndMs = generatedClipRegions.reduce(
			(max, region) => Math.max(max, region.endMs),
			0,
		);
		const result = Math.max(baseDurationMs, generatedClipsEndMs) / 1000;
		// TEMP diagnostic -- remove once the video-less timeline gate is confirmed
		// working. Logs every input this computation depends on so we can see
		// exactly which one is wrong instead of guessing.
		console.log("[timelineDuration debug]", {
			rawDuration: duration,
			safeDurationMs,
			clipRegionsCount: clipRegions.length,
			baseDurationMs,
			generatedClipRegionsCount: generatedClipRegions.length,
			generatedClipRegions: generatedClipRegions.map((r) => ({
				id: r.id,
				startMs: r.startMs,
				endMs: r.endMs,
			})),
			generatedClipsEndMs,
			result,
		});
		return result;
	}, [clipRegions, duration, generatedClipRegions]);
	const effectiveSpeedRegions = useMemo<SpeedRegion[]>(() => {
		const clipDerived = clipRegions
			.filter(({ speed }) => speed !== 1)
			.map((clip) => ({
				id: `clip-speed-${clip.id}`,
				startMs: getClipSourceStartMs(clip),
				endMs: getClipSourceEndMs(clip),
				speed: clip.speed as SpeedRegion["speed"],
			}));
		if (clipDerived.length === 0) return speedRegions;
		return [
			...speedRegions,
			...clipDerived.filter(
				(candidate) =>
					!speedRegions.some(
						(region) =>
							region.endMs > candidate.startMs && region.startMs < candidate.endMs,
					),
			),
		];
	}, [clipRegions, speedRegions]);

	return {
		mapTimelineTimeToSourceTime: toSourceTime,
		mapSourceTimeToTimelineTime: toTimelineTime,
		effectiveZoomRegions,
		effectiveCaptionRegions,
		timelinePlayheadTime,
		timelineDuration,
		effectiveSpeedRegions,
	};
}
