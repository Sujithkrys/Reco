import { type MutableRefObject, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { getKnownAudioFileDurationMs } from "../audio/audioFileDurations";
import {
	type PlayheadEditLayers,
	type PlayheadEditResult,
	type PlayheadEditTarget,
	planSplitAtPlayhead,
	planTrimToPlayhead,
} from "../playheadEdits";
import type { useTimelineState } from "../state/useTimelineState";

type Input = {
	timeline: ReturnType<typeof useTimelineState>;
	/** Current playhead position on the timeline, in ms. */
	playheadMs: number;
	sourceDurationMs: number;
	nextClipIdRef: MutableRefObject<number>;
	nextZoomIdRef: MutableRefObject<number>;
	nextAnnotationIdRef: MutableRefObject<number>;
	nextAudioIdRef: MutableRefObject<number>;
	handleUndo: () => void;
};

export type PlayheadTrimEdge = "start" | "end";

/**
 * Split and trim-to-playhead for the selected item, or — with nothing selected —
 * for the clip under the playhead and every layer under it. Each action writes all
 * changed arrays in one handler, so it is a single undo step.
 */
export function usePlayheadEditCommands({
	timeline,
	playheadMs,
	sourceDurationMs,
	nextClipIdRef,
	nextZoomIdRef,
	nextAnnotationIdRef,
	nextAudioIdRef,
	handleUndo,
}: Input) {
	const {
		clipRegions,
		zoomRegions,
		annotationRegions,
		audioRegions,
		selectedClipId,
		selectedZoomId,
		selectedAnnotationId,
		selectedAudioId,
		selectedCaptionId,
		selectedGeneratedClipId,
		setClipRegions,
		setZoomRegions,
		setAnnotationRegions,
		setAudioRegions,
	} = timeline;

	const layers = useMemo<PlayheadEditLayers>(
		() => ({ clipRegions, zoomRegions, annotationRegions, audioRegions }),
		[clipRegions, zoomRegions, annotationRegions, audioRegions],
	);

	/** The selected item split/trim acts on; "all" when nothing is selected; null for items they don't support. */
	const target = useMemo<PlayheadEditTarget | null>(() => {
		if (selectedAnnotationId) return { kind: "annotation", id: selectedAnnotationId };
		if (selectedZoomId) return { kind: "zoom", id: selectedZoomId };
		if (selectedAudioId) return { kind: "audio", id: selectedAudioId };
		if (selectedClipId) return { kind: "clip", id: selectedClipId };
		if (selectedCaptionId || selectedGeneratedClipId) return null;
		return "all";
	}, [
		selectedAnnotationId,
		selectedZoomId,
		selectedAudioId,
		selectedClipId,
		selectedCaptionId,
		selectedGeneratedClipId,
	]);

	const ids = useMemo(
		() => ({
			clip: () => `clip-${nextClipIdRef.current++}`,
			zoom: () => `zoom-${nextZoomIdRef.current++}`,
			annotation: () => `annotation-${nextAnnotationIdRef.current++}`,
			audio: () => `audio-${nextAudioIdRef.current++}`,
		}),
		[nextAnnotationIdRef, nextAudioIdRef, nextClipIdRef, nextZoomIdRef],
	);
	// Counting must not consume real ids.
	const dryRunIds = useMemo(
		() => ({ clip: () => "", zoom: () => "", annotation: () => "", audio: () => "" }),
		[],
	);
	const trimOptions = useMemo(
		() => ({
			sourceDurationMs,
			getAudioFileDurationMs: (region: { audioPath: string }) =>
				getKnownAudioFileDurationMs(region.audioPath),
		}),
		[sourceDurationMs],
	);

	const apply = useCallback(
		(result: PlayheadEditResult) => {
			if (result.count === 0) return;
			if (result.layers.clipRegions !== clipRegions) setClipRegions(result.layers.clipRegions);
			if (result.layers.zoomRegions !== zoomRegions) setZoomRegions(result.layers.zoomRegions);
			if (result.layers.annotationRegions !== annotationRegions)
				setAnnotationRegions(result.layers.annotationRegions);
			if (result.layers.audioRegions !== audioRegions) setAudioRegions(result.layers.audioRegions);
		},
		[
			annotationRegions,
			audioRegions,
			clipRegions,
			setAnnotationRegions,
			setAudioRegions,
			setClipRegions,
			setZoomRegions,
			zoomRegions,
		],
	);

	const splitCount = useMemo(
		() => (target ? planSplitAtPlayhead(layers, target, playheadMs, dryRunIds).count : 0),
		[dryRunIds, layers, playheadMs, target],
	);
	const trimCount = useCallback(
		(edge: PlayheadTrimEdge) =>
			target ? planTrimToPlayhead(layers, target, edge, playheadMs, trimOptions).count : 0,
		[layers, playheadMs, target, trimOptions],
	);

	const splitAtPlayhead = useCallback(() => {
		if (!target) return 0;
		const result = planSplitAtPlayhead(layers, target, playheadMs, ids);
		apply(result);
		return result.count;
	}, [apply, ids, layers, playheadMs, target]);

	const trimToPlayhead = useCallback(
		(edge: PlayheadTrimEdge) => {
			if (!target) return 0;
			const result = planTrimToPlayhead(layers, target, edge, playheadMs, trimOptions);
			apply(result);
			if (target === "all" && result.count > 0) {
				toast.success(`Trimmed ${result.count} ${result.count === 1 ? "item" : "items"}`, {
					action: { label: "Undo", onClick: handleUndo },
				});
			}
			return result.count;
		},
		[apply, handleUndo, layers, playheadMs, target, trimOptions],
	);

	return {
		/** "all" when nothing is selected; null when the selection does not support split/trim. */
		target,
		splitCount,
		trimCount,
		splitAtPlayhead,
		trimToPlayhead,
	};
}
