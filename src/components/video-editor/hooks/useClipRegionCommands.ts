import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import { toast } from "sonner";
import { changeClipSpan } from "../clipSpanChange";
import { planClipSpeedChange } from "../clipSpeedChange";
import { planClipSplit } from "../clipSplit";
import {
	type ClipRegion,
	type ClipTransition,
	type EditorEffectSection,
	getClipSourceStartMs,
	MAX_TRANSITION_DURATION_MS,
	MIN_TRANSITION_DURATION_MS,
	sortClipRegions,
	type ZoomRegion,
} from "../types";
import { supportsPreviewPlaybackRate } from "../videoPlayback/playbackRate";

type Translator = (
	key: string,
	fallback?: string,
	params?: Record<string, string | number>,
) => string;

interface UseClipRegionCommandsParams {
	sourceDurationMs: number;
	clipRegions: ClipRegion[];
	setClipRegions: Dispatch<SetStateAction<ClipRegion[]>>;
	zoomRegions: ZoomRegion[];
	setZoomRegions: Dispatch<SetStateAction<ZoomRegion[]>>;
	selectedClipId: string | null;
	setSelectedClipId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	nextClipIdRef: MutableRefObject<number>;
	t: Translator;
}

export function useClipRegionCommands({
	sourceDurationMs,
	clipRegions,
	setClipRegions,
	zoomRegions,
	setZoomRegions,
	selectedClipId,
	setSelectedClipId,
	setSelectedZoomId,
	setSelectedAnnotationId,
	setSelectedAudioId,
	setSelectedCaptionId,
	setActiveEffectSection,
	nextClipIdRef,
	t,
}: UseClipRegionCommandsParams) {
	const handleSelectClip = useCallback(
		(id: string | null) => {
			setSelectedClipId(id);
			if (id) {
				setActiveEffectSection("clip");
				setSelectedZoomId(null);
				setSelectedAnnotationId(null);
				setSelectedAudioId(null);
				setSelectedCaptionId(null);
			} else {
				setActiveEffectSection((section) => (section === "clip" ? "scene" : section));
			}
		},
		[
			setActiveEffectSection,
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedClipId,
			setSelectedZoomId,
		],
	);

	const handleClipSplit = useCallback(
		(splitMs: number) => {
			const plan = planClipSplit({
				clipRegions,
				splitMs,
				createId: () => `clip-${nextClipIdRef.current++}`,
			});
			if (!plan) return;
			setClipRegions((current) =>
				current.flatMap((clip) =>
					clip.id === plan.targetId ? [plan.left, plan.right] : [clip],
				),
			);
			if (selectedClipId === plan.targetId) setSelectedClipId(plan.left.id);
		},
		[clipRegions, nextClipIdRef, selectedClipId, setClipRegions, setSelectedClipId],
	);

	const handleClipSpanChange = useCallback(
		(id: string, span: Span) => {
			const oldClip = clipRegions.find((clip) => clip.id === id);
			const newStart = Math.round(span.start);
			const newEnd = Math.round(span.end);

			if (oldClip) {
				const startDelta = newStart - oldClip.startMs;
				const endDelta = newEnd - oldClip.endMs;
				if (Math.abs(startDelta - endDelta) < 1 && Math.abs(startDelta) > 0) {
					setZoomRegions((current) =>
						current.map((zoom) =>
							zoom.startMs < oldClip.endMs && zoom.endMs > oldClip.startMs
								? {
										...zoom,
										startMs: zoom.startMs + startDelta,
										endMs: zoom.endMs + startDelta,
									}
								: zoom,
						),
					);
				}
			}

			setClipRegions((current) =>
				current.map((clip) => {
					if (clip.id !== id) return clip;
					return changeClipSpan(clip, newStart, newEnd, sourceDurationMs);
				}),
			);
		},
		[clipRegions, setClipRegions, setZoomRegions, sourceDurationMs],
	);

	const handleClipSpeedChange = useCallback(
		(speed: number) => {
			if (!selectedClipId || !Number.isFinite(speed) || speed <= 0) return;
			if (!supportsPreviewPlaybackRate(speed)) {
				toast.error(
					t(
						"editor.timeline.unsupportedSpeed",
						"This speed is not supported for preview on this device.",
					),
				);
				return;
			}
			const plan = planClipSpeedChange({ clipRegions, zoomRegions, selectedClipId, speed });
			if (!plan) return;
			if ("blockedReason" in plan) {
				toast.warning(
					plan.blockedReason === "clip-overlap"
						? t(
								"editor.timeline.speedClipOverlap",
								"Speed change would overlap the next clip. Move or split clips before slowing this section.",
							)
						: t(
								"editor.timeline.speedZoomOverlap",
								"Speed change would overlap another zoom. Move or delete the overlapping zoom first.",
							),
				);
				return;
			}
			setClipRegions(plan.clipRegions);
			setZoomRegions(plan.zoomRegions);
		},
		[clipRegions, selectedClipId, setClipRegions, setZoomRegions, t, zoomRegions],
	);

	const handleClipMutedChange = useCallback(
		(muted: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) => (clip.id === selectedClipId ? { ...clip, muted } : clip)),
			);
		},
		[selectedClipId, setClipRegions],
	);
	const handleClipShowSourceAudioChange = useCallback(
		(showSourceAudio: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) =>
					clip.id === selectedClipId ? { ...clip, showSourceAudio } : clip,
				),
			);
		},
		[selectedClipId, setClipRegions],
	);

	const handleClipTransitionChange = useCallback(
		(clipId: string, transition: ClipTransition | null) => {
			const sorted = sortClipRegions(clipRegions);
			const index = sorted.findIndex((clip) => clip.id === clipId);
			if (index === -1 || index === sorted.length - 1) return;

			const clip = sorted[index];
			const nextClip = sorted[index + 1];
			if (nextClip.startMs !== clip.endMs) {
				toast.warning(
					t(
						"editor.timeline.transitionNeedsAdjacentClips",
						"Clips must be touching, with no gap, to add a transition.",
					),
				);
				return;
			}

			const oldDurationMs = clip.transitionOut?.durationMs ?? 0;

			if (!transition) {
				if (oldDurationMs === 0) return;
				setClipRegions((current) =>
					current.map((c) => {
						if (c.id === clip.id) {
							const { transitionOut: _removed, ...rest } = c;
							return rest;
						}
						if (c.id === nextClip.id) {
							return { ...c, sourceStartMs: getClipSourceStartMs(c) - oldDurationMs };
						}
						return c;
					}),
				);
				return;
			}

			const clipTimelineLenMs = clip.endMs - clip.startMs;
			let newDurationMs = Math.max(
				MIN_TRANSITION_DURATION_MS,
				Math.min(transition.durationMs, clipTimelineLenMs, MAX_TRANSITION_DURATION_MS),
			);

			const nextSpeed =
				Number.isFinite(nextClip.speed) && nextClip.speed > 0 ? nextClip.speed : 1;
			const nextSourceLenMs = (nextClip.endMs - nextClip.startMs) * nextSpeed;
			// Undo any previously-applied shift before measuring how much room is
			// actually available, so re-editing an existing transition's duration
			// doesn't compound against its own earlier adjustment.
			const baseNextSourceStartMs = getClipSourceStartMs(nextClip) - oldDurationMs;
			const maxAvailableDurationMs = Math.max(
				0,
				Math.floor((sourceDurationMs - nextSourceLenMs - baseNextSourceStartMs) / nextSpeed),
			);

			if (maxAvailableDurationMs < MIN_TRANSITION_DURATION_MS) {
				toast.warning(
					t(
						"editor.timeline.transitionNoRoom",
						"Not enough footage after this cut to add a transition here.",
					),
				);
				return;
			}
			newDurationMs = Math.min(newDurationMs, maxAvailableDurationMs);

			const delta = newDurationMs - oldDurationMs;
			setClipRegions((current) =>
				current.map((c) => {
					if (c.id === clip.id) {
						return { ...c, transitionOut: { kind: transition.kind, durationMs: newDurationMs } };
					}
					if (c.id === nextClip.id && delta !== 0) {
						return { ...c, sourceStartMs: getClipSourceStartMs(c) + delta };
					}
					return c;
				}),
			);
		},
		[clipRegions, setClipRegions, sourceDurationMs, t],
	);

	const handleClipDelete = useCallback(
		(id: string) => {
			// Other tracks have their own timeline positions; deleting footage is not a ripple edit.
			setClipRegions((current) => current.filter((clip) => clip.id !== id));
			if (selectedClipId === id) setSelectedClipId(null);
		},
		[selectedClipId, setClipRegions, setSelectedClipId],
	);

	return {
		handleSelectClip,
		handleClipSplit,
		handleClipSpanChange,
		handleClipSpeedChange,
		handleClipMutedChange,
		handleClipShowSourceAudioChange,
		handleClipTransitionChange,
		handleClipDelete,
	};
}
