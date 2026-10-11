import type { ExportProgress } from "@/lib/exporter";
import { toFileUrl } from "../projectPersistence";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import type { CursorTelemetryPoint, SpeedRegion, ZoomRegion } from "../types";
import { resolveBackgroundForLayout } from "../videoPlayback/layoutUtils";

type AppearanceState = ReturnType<typeof useAppearanceState>;
type TimelineState = ReturnType<typeof useTimelineState>;

type BuildExportRenderOptionsInput = {
	appearance: AppearanceState;
	timeline: TimelineState;
	effectiveSpeedRegions: SpeedRegion[];
	effectiveZoomRegions: ZoomRegion[];
	effectiveCursorTelemetry: CursorTelemetryPoint[];
	effectiveShowCursor: boolean;
	previewWidth: number;
	previewHeight: number;
	shadowIntensity: number;
	onProgress: (progress: ExportProgress) => void;
};

export function buildExportRenderOptions({
	appearance,
	timeline,
	effectiveSpeedRegions,
	effectiveZoomRegions,
	effectiveCursorTelemetry,
	effectiveShowCursor,
	previewWidth,
	previewHeight,
	shadowIntensity,
	onProgress,
}: BuildExportRenderOptionsInput) {
	// None draws black behind the video with zero padding; the stored padding stays as chosen.
	const background = resolveBackgroundForLayout({
		wallpaper: appearance.wallpaper,
		padding: appearance.padding,
				backgroundEnabled: appearance.backgroundEnabled,
			});
	return {
		clipRegions: timeline.clipRegions,
		wallpaper: background.wallpaper,
		trimRegions: timeline.trimRegions,
		speedRegions: effectiveSpeedRegions,
		showShadow: shadowIntensity > 0,
		shadowIntensity,
		backgroundBlur: appearance.backgroundBlur,
		zoomMotionBlur: appearance.zoomMotionBlur,
		zoomMotionBlurTuning: appearance.zoomMotionBlurTuning,
		connectZooms: appearance.connectZooms,
		zoomInDurationMs: appearance.zoomInDurationMs,
		zoomInOverlapMs: appearance.zoomInOverlapMs,
		zoomOutDurationMs: appearance.zoomOutDurationMs,
		connectedZoomGapMs: appearance.connectedZoomGapMs,
		connectedZoomDurationMs: appearance.connectedZoomDurationMs,
		zoomInEasing: appearance.zoomInEasing,
		zoomOutEasing: appearance.zoomOutEasing,
		connectedZoomEasing: appearance.connectedZoomEasing,
		borderRadius: appearance.borderRadius,
		padding: background.padding,
		cropRegion: appearance.cropRegion,
		webcam: appearance.webcam,
		webcamUrl:
			appearance.resolvedWebcamVideoUrl ??
			(appearance.webcam.sourcePath ? toFileUrl(appearance.webcam.sourcePath) : null),
		annotationRegions: timeline.annotationRegions,
		autoCaptions: timeline.autoCaptions,
		autoCaptionSettings: timeline.autoCaptionSettings,
		generatedClipRegions: timeline.generatedClipRegions,
		zoomRegions: effectiveZoomRegions,
		cursorTelemetry: effectiveCursorTelemetry,
		showCursor: effectiveShowCursor,
		cursorStyle: appearance.cursorStyle,
		cursorSize: appearance.cursorSize,
		cursorSmoothing: appearance.cursorSmoothing,
		cursorSpringStiffnessMultiplier: appearance.cursorSpringStiffnessMultiplier,
		cursorSpringDampingMultiplier: appearance.cursorSpringDampingMultiplier,
		cursorSpringMassMultiplier: appearance.cursorSpringMassMultiplier,
		cameraSpringStiffnessMultiplier: appearance.cameraSpringStiffnessMultiplier,
		cameraSpringDampingMultiplier: appearance.cameraSpringDampingMultiplier,
		cameraSpringMassMultiplier: appearance.cameraSpringMassMultiplier,
		zoomSmoothness: appearance.zoomSmoothness,
		zoomClassicMode: appearance.zoomClassicMode,
		cursorMotionBlur: appearance.cursorMotionBlur,
		cursorClickEffect: appearance.cursorClickEffect,
		cursorClickEffectColor: appearance.cursorClickEffectColor,
		cursorClickEffectScale: appearance.cursorClickEffectScale,
		cursorClickEffectOpacity: appearance.cursorClickEffectOpacity,
		cursorClickEffectDurationMs: appearance.cursorClickEffectDurationMs,
		cursorClickBounce: appearance.cursorClickBounce,
		cursorClickBounceDuration: appearance.cursorClickBounceDuration,
		cursorSway: appearance.cursorSway,
		previewWidth,
		previewHeight,
		onProgress,
	};
}
