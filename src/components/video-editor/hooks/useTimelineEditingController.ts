import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { useCallback } from "react";
import { toast } from "sonner";
import type { useI18n } from "@/contexts/I18nContext";
import type { useShortcuts } from "@/contexts/ShortcutsContext";
import { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import {
	clearTimelineSelectionsExcept,
	type TimelineSelectionKind,
} from "../state/timelineSelection";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { EditorEffectSection } from "../types";
import type { VideoPlaybackRef } from "../VideoPlayback";
import { getErrorMessage, summarizeErrorMessage } from "../videoEditorUtils";
import { useAnnotationRegionCommands } from "./useAnnotationRegionCommands";
import { useAudioRegionCommands } from "./useAudioRegionCommands";
import { useCaptionCommands } from "./useCaptionCommands";
import { useClipRegionCommands } from "./useClipRegionCommands";
import { useCursorTelemetry } from "./useCursorTelemetry";
import { useEditorGlobalInteractions } from "./useEditorGlobalInteractions";
import { useEditorPlaybackControls } from "./useEditorPlaybackControls";
import { useFreshRecordingAutoZoom } from "./useFreshRecordingAutoZoom";
import { useGeneratedClipRegionCommands } from "./useGeneratedClipRegionCommands";
import { usePlayheadEditCommands } from "./usePlayheadEditCommands";
import { useTimelineProjection } from "./useTimelineProjection";
import { useZoomRegionCommands } from "./useZoomRegionCommands";

type Input = {
	t: ReturnType<typeof useI18n>["t"];
	shortcuts: ReturnType<typeof useShortcuts>["shortcuts"];
	isMac: boolean;
	appPlatform: string;
	timeline: ReturnType<typeof useTimelineState>;
	appearance: ReturnType<typeof useAppearanceState>;
	videoPath: string | null;
	videoSourcePath: string | null;
	currentSourcePath: string | null;
	duration: number;
	currentTime: number;
	isPlaying: boolean;
	previewVolume: number;
	loading: boolean;
	isPreviewReady: boolean;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	setAutoSuggestZoomsTrigger: Dispatch<SetStateAction<number>>;
	videoPlaybackRef: RefObject<VideoPlaybackRef>;
	timelineRef: RefObject<TimelineEditorHandle>;
	nextZoomIdRef: MutableRefObject<number>;
	nextClipIdRef: MutableRefObject<number>;
	nextAudioIdRef: MutableRefObject<number>;
	nextAnnotationIdRef: MutableRefObject<number>;
	nextAnnotationZIndexRef: MutableRefObject<number>;
	clipInitializedRef: MutableRefObject<boolean>;
	autoFullTrackClipIdRef: MutableRefObject<string | null>;
	autoFullTrackClipEndMsRef: MutableRefObject<number | null>;
	autoSuggestedVideoPathRef: MutableRefObject<string | null>;
	pendingFreshRecordingAutoZoomPathRef: MutableRefObject<string | null>;
	pendingFreshRecordingAutoSuggestTimeoutRef: MutableRefObject<number | null>;
	pendingFreshRecordingAutoSuggestTelemetryCountRef: MutableRefObject<number>;
	handleUndo: () => void;
	handleRedo: () => void;
};

export function useTimelineEditingController(input: Input) {
	const { timeline } = input;
	const handleSourceFallbackLoadError = useCallback((error: unknown) => {
		toast.warning(
			`Could not load companion audio source: ${summarizeErrorMessage(getErrorMessage(error))}`,
			{ duration: 10000 },
		);
	}, []);
	const cursor = useCursorTelemetry({
		videoPath: input.videoPath,
		videoSourcePath: input.videoSourcePath,
		duration: input.duration,
		loopCursor: input.appearance.loopCursor,
		timeline,
		pendingFreshRecordingAutoZoomPathRef: input.pendingFreshRecordingAutoZoomPathRef,
		autoSuggestedVideoPathRef: input.autoSuggestedVideoPathRef,
	});
	const projection = useTimelineProjection({
		timeline,
		duration: input.duration,
		currentTime: input.currentTime,
		nextClipIdRef: input.nextClipIdRef,
		initializedRef: input.clipInitializedRef,
		autoFullTrackIdRef: input.autoFullTrackClipIdRef,
		autoFullTrackEndRef: input.autoFullTrackClipEndMsRef,
	});
	const audio = useVideoEditorAudio({
		currentSourcePath: input.currentSourcePath,
		selectedClipId: timeline.selectedClipId,
		clipRegions: timeline.clipRegions,
		audioRegions: timeline.audioRegions,
		sourceAudioTrackSettingsByClip: timeline.sourceAudioTrackSettingsByClip,
		setSourceAudioTrackSettingsByClip: timeline.setSourceAudioTrackSettingsByClip,
		defaultSourceAudioTrackSettings: timeline.defaultSourceAudioTrackSettings,
		setDefaultSourceAudioTrackSettings: timeline.setDefaultSourceAudioTrackSettings,
		timelineTime: projection.timelinePlayheadTime,
		currentTime: projection.mapTimelineTimeToSourceTime(input.currentTime * 1000) / 1000,
		duration: input.duration,
		isPlaying: input.isPlaying,
		previewVolume: input.previewVolume,
		sourceAudioFallbackRefreshKey: timeline.sourceAudioFallbackRefreshKey,
		summarizeErrorMessage,
		onSourceFallbackLoadError: handleSourceFallbackLoadError,
	});
	const playback = useEditorPlaybackControls({
		videoPlaybackRef: input.videoPlaybackRef,
		timelineRef: input.timelineRef,
		playSourceAudioPreview: audio.playSourceAudioPreview,
		timelinePlayheadTime: projection.timelinePlayheadTime,
		timelineDuration: projection.timelineDuration,
	});
	// Timeline selection is exclusive: selecting any item clears every other one,
	// including a main clip that used to stay selected underneath layers.
	const {
		setSelectedZoomId,
		setSelectedClipId,
		setSelectedAnnotationId,
		setSelectedAudioId,
		setSelectedCaptionId,
		setSelectedGeneratedClipId,
	} = timeline;
	const clearOtherSelections = useCallback(
		(keep: TimelineSelectionKind) =>
			clearTimelineSelectionsExcept(
				{
					setSelectedZoomId,
					setSelectedClipId,
					setSelectedAnnotationId,
					setSelectedAudioId,
					setSelectedCaptionId,
					setSelectedGeneratedClipId,
				},
				keep,
			),
		[
			setSelectedZoomId,
			setSelectedClipId,
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedGeneratedClipId,
		],
	);
	const captionCommands = useCaptionCommands({
		clipRegions: timeline.clipRegions,
		autoCaptions: timeline.autoCaptions,
		setAutoCaptions: timeline.setAutoCaptions,
		setAutoCaptionSettings: timeline.setAutoCaptionSettings,
		setSelectedCaptionId: timeline.setSelectedCaptionId,
		clearOtherSelections,
		setActiveEffectSection: input.setActiveEffectSection,
		videoPlaybackRef: input.videoPlaybackRef,
		mapSourceTimeToTimelineTime: projection.mapSourceTimeToTimelineTime,
		handleSeek: playback.handleSeek,
	});
	const zoomCommands = useZoomRegionCommands({
		videoPath: input.videoPath,
		setZoomRegions: timeline.setZoomRegions,
		selectedZoomId: timeline.selectedZoomId,
		setSelectedZoomId: timeline.setSelectedZoomId,
		clearOtherSelections,
		setActiveEffectSection: input.setActiveEffectSection,
		nextZoomIdRef: input.nextZoomIdRef,
		autoSuggestedVideoPathRef: input.autoSuggestedVideoPathRef,
		pendingFreshRecordingAutoZoomPathRef: input.pendingFreshRecordingAutoZoomPathRef,
	});
	const handleSelectAnnotation = useCallback(
		(id: string | null) => {
			timeline.setSelectedAnnotationId(id);
			if (id) clearOtherSelections("annotation");
		},
		[timeline.setSelectedAnnotationId, clearOtherSelections],
	);
	const handleSelectGeneratedClip = useCallback(
		(id: string | null) => {
			timeline.setSelectedGeneratedClipId(id);
			if (id) clearOtherSelections("generatedClip");
		},
		[timeline.setSelectedGeneratedClipId, clearOtherSelections],
	);
	const freshZoom = useFreshRecordingAutoZoom({
		appPlatform: input.appPlatform,
		videoPath: input.videoPath,
		loading: input.loading,
		isPreviewReady: input.isPreviewReady,
		duration: input.duration,
		cursorTelemetryCount: timeline.cursorTelemetry.length,
		normalizedCursorTelemetry: cursor.normalizedCursorTelemetry,
		zoomRegions: timeline.zoomRegions,
		setZoomRegions: timeline.setZoomRegions,
		setAutoSuggestZoomsTrigger: input.setAutoSuggestZoomsTrigger,
		videoPlaybackRef: input.videoPlaybackRef,
		autoSuggestedVideoPathRef: input.autoSuggestedVideoPathRef,
		pendingFreshRecordingAutoZoomPathRef: input.pendingFreshRecordingAutoZoomPathRef,
		pendingFreshRecordingAutoSuggestTimeoutRef:
			input.pendingFreshRecordingAutoSuggestTimeoutRef,
		pendingFreshRecordingAutoSuggestTelemetryCountRef:
			input.pendingFreshRecordingAutoSuggestTelemetryCountRef,
	});
	const clipCommands = useClipRegionCommands({
		sourceDurationMs: input.duration * 1000,
		clipRegions: timeline.clipRegions,
		setClipRegions: timeline.setClipRegions,
		zoomRegions: timeline.zoomRegions,
		setZoomRegions: timeline.setZoomRegions,
		selectedClipId: timeline.selectedClipId,
		setSelectedClipId: timeline.setSelectedClipId,
		clearOtherSelections,
		setActiveEffectSection: input.setActiveEffectSection,
		nextClipIdRef: input.nextClipIdRef,
		t: input.t,
	});
	const audioCommands = useAudioRegionCommands({
		setAudioRegions: timeline.setAudioRegions,
		selectedAudioId: timeline.selectedAudioId,
		setSelectedAudioId: timeline.setSelectedAudioId,
		clearOtherSelections,
		setActiveEffectSection: input.setActiveEffectSection,
		nextAudioIdRef: input.nextAudioIdRef,
	});
	const annotationCommands = useAnnotationRegionCommands({
		setAnnotationRegions: timeline.setAnnotationRegions,
		selectedAnnotationId: timeline.selectedAnnotationId,
		setSelectedAnnotationId: timeline.setSelectedAnnotationId,
		clearOtherSelections,
		nextAnnotationIdRef: input.nextAnnotationIdRef,
		nextAnnotationZIndexRef: input.nextAnnotationZIndexRef,
		playheadMs: projection.timelinePlayheadTime * 1000,
		totalMs: projection.timelineDuration * 1000,
	});
	const generatedClipCommands = useGeneratedClipRegionCommands({
		setGeneratedClipRegions: timeline.setGeneratedClipRegions,
		selectedGeneratedClipId: timeline.selectedGeneratedClipId,
		setSelectedGeneratedClipId: timeline.setSelectedGeneratedClipId,
		clearOtherSelections,
	});

	const playheadEdits = usePlayheadEditCommands({
		timeline,
		playheadMs: projection.timelinePlayheadTime * 1000,
		sourceDurationMs: input.duration * 1000,
		nextClipIdRef: input.nextClipIdRef,
		nextZoomIdRef: input.nextZoomIdRef,
		nextAnnotationIdRef: input.nextAnnotationIdRef,
		nextAudioIdRef: input.nextAudioIdRef,
		handleUndo: input.handleUndo,
	});

	useEditorGlobalInteractions({
		timeline,
		videoPlaybackRef: input.videoPlaybackRef,
		shortcuts: input.shortcuts,
		isMac: input.isMac,
		handleUndo: input.handleUndo,
		handleRedo: input.handleRedo,
		startPlayback: playback.startPlayback,
	});

	return {
		cursor,
		projection,
		audio,
		playback,
		captionCommands,
		zoomCommands,
		clipCommands,
		audioCommands,
		annotationCommands,
		generatedClipCommands,
		playheadEdits,
		handleSelectAnnotation,
		handleSelectGeneratedClip,
		handleAutoSuggestZoomsConsumed: freshZoom.handleAutoSuggestZoomsConsumed,
	};
}
