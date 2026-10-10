import { useEffect } from "react";
import { normalizeRegionSpan } from "../core/spans";
import type { AudioRegion, SpeedRegion, TrimRegion, ZoomRegion } from "../../types";

interface UseTimelineNormalizationParams {
	totalMs: number;
	safeMinDurationMs: number;
	zoomRegions: ZoomRegion[];
	trimRegions: TrimRegion[];
	speedRegions: SpeedRegion[];
	audioRegions: AudioRegion[];
	onZoomSpanChange: (id: string, span: { start: number; end: number }) => void;
	onTrimSpanChange?: (id: string, span: { start: number; end: number }) => void;
	onSpeedSpanChange?: (id: string, span: { start: number; end: number }) => void;
	onAudioSpanChange?: (id: string, span: { start: number; end: number }) => void;
	/**
	 * Called once before any region is clamped. The clamp follows from another
	 * edit (e.g. shortening the last clip), so undo history folds it into that
	 * edit instead of recording a step that undo could never get past.
	 */
	onBeforeNormalize?: () => void;
}

export function useTimelineNormalization({
	totalMs,
	safeMinDurationMs,
	zoomRegions,
	trimRegions,
	speedRegions,
	audioRegions,
	onZoomSpanChange,
	onTrimSpanChange,
	onSpeedSpanChange,
	onAudioSpanChange,
	onBeforeNormalize,
}: UseTimelineNormalizationParams) {
	useEffect(() => {
		if (totalMs === 0 || safeMinDurationMs <= 0) {
			return;
		}

		const changes: Array<() => void> = [];
		const collect = (
			regions: Array<{ id: string; startMs: number; endMs: number }>,
			onChange: ((id: string, span: { start: number; end: number }) => void) | undefined,
		) => {
			if (!onChange) return;
			for (const region of regions) {
				const normalized = normalizeRegionSpan({
					startMs: region.startMs,
					endMs: region.endMs,
					totalMs,
					minDurationMs: safeMinDurationMs,
				});

				if (normalized.start !== region.startMs || normalized.end !== region.endMs) {
					changes.push(() => onChange(region.id, normalized));
				}
			}
		};

		collect(zoomRegions, onZoomSpanChange);
		collect(trimRegions, onTrimSpanChange);
		collect(speedRegions, onSpeedSpanChange);
		collect(audioRegions, onAudioSpanChange);

		if (changes.length === 0) return;
		onBeforeNormalize?.();
		for (const change of changes) change();
	}, [
		totalMs,
		safeMinDurationMs,
		zoomRegions,
		trimRegions,
		speedRegions,
		audioRegions,
		onZoomSpanChange,
		onTrimSpanChange,
		onSpeedSpanChange,
		onAudioSpanChange,
		onBeforeNormalize,
	]);
}
