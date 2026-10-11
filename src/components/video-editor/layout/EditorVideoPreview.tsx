import { type ComponentProps, type Dispatch, type RefObject, type SetStateAction, useEffect, useMemo } from "react";
import type { AspectRatio } from "@/utils/aspectRatioUtils";
import {
	applyAnnotationPreview,
	clearAnnotationPreview,
	useAnnotationPreview,
} from "../annotationHoverPreview";
import { resolveBackgroundForLayout } from "../videoPlayback/layoutUtils";
import { previewedWallpaper, useWallpaperPreview } from "../wallpaperHoverPreview";
import type { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import type { CursorTelemetryPoint, ZoomRegion } from "../types";
import VideoPlayback, { type VideoPlaybackRef } from "../VideoPlayback";

type PlaybackProps = ComponentProps<typeof VideoPlayback>;
type Handlers = Pick<
	PlaybackProps,
	| "onSelectZoom"
	| "onZoomFocusChange"
	| "onEditAutoCaption"
	| "onSelectAnnotation"
		| "onClearSelections"
	| "onAnnotationPositionChange"
	| "onAnnotationSizeChange"
	| "onAnnotationStyleChange"
>;

type Props = {
	videoPath: string | null;
	previewVersion: number;
	aspectRatio: AspectRatio;
	playbackRef: RefObject<VideoPlaybackRef>;
	currentTime: number;
	isPlaying: boolean;
	previewVolume: number;
	suspendRendering: boolean;
	appearance: ReturnType<typeof useAppearanceState>;
	timeline: ReturnType<typeof useTimelineState>;
	audio: ReturnType<typeof useVideoEditorAudio>;
	effectiveZoomRegions: ZoomRegion[];
	effectiveCursorTelemetry: CursorTelemetryPoint[];
	effectiveShowCursor: boolean;
	setDuration: Dispatch<SetStateAction<number>>;
	setIsPreviewReady: Dispatch<SetStateAction<boolean>>;
	setCurrentTime: Dispatch<SetStateAction<number>>;
	setIsPlaying: Dispatch<SetStateAction<boolean>>;
	setError: Dispatch<SetStateAction<string | null>>;
	handlers: Handlers;
};

export function EditorVideoPreview({
	videoPath,
	previewVersion,
	aspectRatio,
	playbackRef,
	currentTime,
	isPlaying,
	previewVolume,
	suspendRendering,
	appearance,
	timeline,
	audio,
	effectiveZoomRegions,
	effectiveCursorTelemetry,
	effectiveShowCursor,
	setDuration,
	setIsPreviewReady,
	setCurrentTime,
	setIsPlaying,
	setError,
	handlers,
}: Props) {
	// Hover previews (colour swatches, fonts) are drawn here only; the project data,
	// the edit history and the export keep using the real regions.
	const annotationPreview = useAnnotationPreview();
	const wallpaperPreview = useWallpaperPreview();
	// The same None handling as the export: black behind the video, zero padding.
	const background = resolveBackgroundForLayout({
		wallpaper: previewedWallpaper(appearance.wallpaper, wallpaperPreview),
		padding: appearance.padding,
	});
	const previewAnnotationRegions = useMemo(
		() => applyAnnotationPreview(timeline.annotationRegions, annotationPreview),
		[timeline.annotationRegions, annotationPreview],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a preview never survives a selection change
	useEffect(() => clearAnnotationPreview(), [timeline.selectedAnnotationId]);
	return (
		<VideoPlayback
			clipRegions={timeline.clipRegions}
			key={`${videoPath || "no-video"}:${previewVersion}:inline`}
			aspectRatio={aspectRatio}
			ref={playbackRef}
			videoPath={videoPath || ""}
			onDurationChange={setDuration}
			onPreviewReadyChange={setIsPreviewReady}
			onTimeUpdate={setCurrentTime}
			currentTime={currentTime}
			onPlayStateChange={setIsPlaying}
			onError={setError}
			wallpaper={background.wallpaper}
			zoomRegions={effectiveZoomRegions}
			selectedZoomId={timeline.selectedZoomId}
			isPlaying={isPlaying}
			showShadow={appearance.shadowIntensity > 0}
			shadowIntensity={appearance.shadowIntensity}
			backgroundBlur={appearance.backgroundBlur}
			connectZooms={appearance.connectZooms}
			zoomInDurationMs={appearance.zoomInDurationMs}
			zoomInOverlapMs={appearance.zoomInOverlapMs}
			zoomOutDurationMs={appearance.zoomOutDurationMs}
			connectedZoomGapMs={appearance.connectedZoomGapMs}
			connectedZoomDurationMs={appearance.connectedZoomDurationMs}
			zoomInEasing={appearance.zoomInEasing}
			zoomOutEasing={appearance.zoomOutEasing}
			connectedZoomEasing={appearance.connectedZoomEasing}
			borderRadius={appearance.borderRadius}
			padding={background.padding}
			cropRegion={appearance.cropRegion}
			webcam={appearance.webcam}
			webcamVideoPath={
				appearance.webcam.sourcePath ? appearance.resolvedWebcamVideoUrl : null
			}
			generatedClipRegions={timeline.generatedClipRegions}
			annotationRegions={previewAnnotationRegions}
			autoCaptions={timeline.autoCaptions}
			autoCaptionSettings={timeline.autoCaptionSettings}
			selectedAnnotationId={timeline.selectedAnnotationId}
			cursorTelemetry={effectiveCursorTelemetry}
			showCursor={effectiveShowCursor}
			cursorStyle={appearance.cursorStyle}
			cursorSize={appearance.cursorSize}
			cursorSmoothing={appearance.cursorSmoothing}
			cursorSpringStiffnessMultiplier={appearance.cursorSpringStiffnessMultiplier}
			cursorSpringDampingMultiplier={appearance.cursorSpringDampingMultiplier}
			cursorSpringMassMultiplier={appearance.cursorSpringMassMultiplier}
			cameraSpringStiffnessMultiplier={appearance.cameraSpringStiffnessMultiplier}
			cameraSpringDampingMultiplier={appearance.cameraSpringDampingMultiplier}
			cameraSpringMassMultiplier={appearance.cameraSpringMassMultiplier}
			zoomSmoothness={appearance.zoomSmoothness}
			zoomClassicMode={appearance.zoomClassicMode}
			zoomMotionBlur={appearance.zoomMotionBlur}
			zoomMotionBlurTuning={appearance.zoomMotionBlurTuning}
			cursorMotionBlur={appearance.cursorMotionBlur}
			cursorClickEffect={appearance.cursorClickEffect}
			cursorClickEffectColor={appearance.cursorClickEffectColor}
			cursorClickEffectScale={appearance.cursorClickEffectScale}
			cursorClickEffectOpacity={appearance.cursorClickEffectOpacity}
			cursorClickEffectDurationMs={appearance.cursorClickEffectDurationMs}
			cursorClickBounce={appearance.cursorClickBounce}
			cursorClickBounceDuration={appearance.cursorClickBounceDuration}
			cursorSway={appearance.cursorSway}
			volume={
				audio.shouldMutePreviewVideo || audio.isCurrentClipMuted
					? 0
					: Math.max(0, Math.min(1, previewVolume * audio.embeddedSourcePreviewGain))
			}
			suspendRendering={suspendRendering}
			{...handlers}
		/>
	);
}
