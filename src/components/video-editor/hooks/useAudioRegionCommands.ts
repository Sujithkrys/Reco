import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import {
	getKnownAudioFileDurationMs,
	rememberAudioFileDurationMs,
} from "../audio/audioFileDurations";
import { changeAudioSpan } from "../audioSpanChange";
import type { AudioRegion, EditorEffectSection } from "../types";

interface UseAudioRegionCommandsParams {
	setAudioRegions: Dispatch<SetStateAction<AudioRegion[]>>;
	selectedAudioId: string | null;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	nextAudioIdRef: MutableRefObject<number>;
}

export function useAudioRegionCommands({
	setAudioRegions,
	selectedAudioId,
	setSelectedAudioId,
	setSelectedZoomId,
	setSelectedAnnotationId,
	setSelectedCaptionId,
	setActiveEffectSection,
	nextAudioIdRef,
}: UseAudioRegionCommandsParams) {
	const handleSelectAudio = useCallback(
		(id: string | null) => {
			setSelectedAudioId(id);
			if (id) {
				setSelectedZoomId(null);
				setSelectedAnnotationId(null);
				setSelectedCaptionId(null);
				setActiveEffectSection("audio");
			}
		},
		[
			setActiveEffectSection,
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedZoomId,
		],
	);

	const handleAudioAdded = useCallback(
		(span: Span, audioPath: string, trackIndex?: number, sourceDurationMs?: number) => {
			const id = `audio-${nextAudioIdRef.current++}`;
			const knownDurationMs =
				typeof sourceDurationMs === "number" &&
				Number.isFinite(sourceDurationMs) &&
				sourceDurationMs > 0
					? Math.round(sourceDurationMs)
					: undefined;
			if (knownDurationMs !== undefined) {
				rememberAudioFileDurationMs(audioPath, knownDurationMs);
			}
			const newRegion: AudioRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				audioPath,
				volume: 1,
				normalize: false,
				trackIndex,
				sourceStartMs: 0,
				...(knownDurationMs === undefined ? {} : { sourceDurationMs: knownDurationMs }),
			};
			setAudioRegions((current) => [...current, newRegion]);
			setSelectedAudioId(id);
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
			setSelectedCaptionId(null);
			setActiveEffectSection("audio");
		},
		[
			nextAudioIdRef,
			setActiveEffectSection,
			setAudioRegions,
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedZoomId,
		],
	);

	const handleAudioSpanChange = useCallback(
		(id: string, span: Span, trackIndex?: number) => {
			const normalizedTrackIndex =
				typeof trackIndex === "number" && Number.isFinite(trackIndex)
					? Math.max(0, Math.floor(trackIndex))
					: undefined;
			setAudioRegions((current) =>
				current.map((region) => {
					if (region.id !== id) return region;
					const next = changeAudioSpan(
						region,
						span.start,
						span.end,
						region.sourceDurationMs ?? getKnownAudioFileDurationMs(region.audioPath),
					);
					return normalizedTrackIndex === undefined
						? next
						: { ...next, trackIndex: normalizedTrackIndex };
				}),
			);
		},
		[setAudioRegions],
	);

	const handleAudioVolumeChange = useCallback(
		(volume: number) => {
			if (!selectedAudioId || !Number.isFinite(volume)) return;
			const nextVolume = Math.max(0, Math.min(1, volume));
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === selectedAudioId ? { ...region, volume: nextVolume } : region,
				),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	const handleAudioDelete = useCallback(
		(id: string) => {
			setAudioRegions((current) => current.filter((region) => region.id !== id));
			if (selectedAudioId === id) setSelectedAudioId(null);
		},
		[selectedAudioId, setAudioRegions, setSelectedAudioId],
	);

	const handleAudioNormalizeChange = useCallback(
		(normalize: boolean) => {
			if (!selectedAudioId) return;
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === selectedAudioId ? { ...region, normalize } : region,
				),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	return {
		handleSelectAudio,
		handleAudioAdded,
		handleAudioSpanChange,
		handleAudioVolumeChange,
		handleAudioDelete,
		handleAudioNormalizeChange,
	};
}
