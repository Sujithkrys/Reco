import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from "react";
import type { AspectRatio } from "@/utils/aspectRatioUtils";
import { type EditorPresetSnapshot, loadEditorPresets } from "../editorPreferences";
import type { useExportSettings } from "../export/useExportSettings";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import { useEditorPresets } from "./useEditorPresets";

type Input = {
	t: Parameters<typeof useEditorPresets>[0]["t"];
	appearance: ReturnType<typeof useAppearanceState>;
	timeline: ReturnType<typeof useTimelineState>;
	exportSettings: ReturnType<typeof useExportSettings>;
	aspectRatio: AspectRatio;
	setAspectRatio: Dispatch<SetStateAction<AspectRatio>>;
	sourceDurationMs: number;
	timelineDurationMs: number;
};

export function useVideoEditorPresets({
	t,
	appearance,
	timeline,
	exportSettings,
	aspectRatio,
	setAspectRatio,
	sourceDurationMs,
	timelineDurationMs,
}: Input) {
	const [editorPresets, setEditorPresets] = useState(() => loadEditorPresets());
	const [activeEditorPresetId, setActiveEditorPresetId] = useState<string | null>(null);
	const [presetPopoverOpen, setPresetPopoverOpen] = useState(false);
	const [presetNameDraft, setPresetNameDraft] = useState("");

	const currentSnapshot = useMemo<EditorPresetSnapshot>(
		() => {
			let _excludedMidTimelineElements = 0;
			let _excludedCustomAssets = 0;
			
			const templateClips: EditorPresetSnapshot["templateClips"] = [];
			for (const region of timeline.clipRegions) {
				if (region.startMs === 0) {
					const { startMs, endMs, sourceStartMs, ...rest } = region;
					templateClips.push({ ...rest, anchor: { reference: "start", offsetMs: 0 }, durationMs: endMs - startMs, sourceOffsetMs: sourceStartMs !== undefined ? sourceStartMs : undefined });
				} else if (region.endMs === timelineDurationMs) {
					const { startMs, endMs, sourceStartMs, ...rest } = region;
					templateClips.push({ ...rest, anchor: { reference: "end", offsetMs: startMs - timelineDurationMs }, durationMs: endMs - startMs, sourceOffsetMs: sourceStartMs !== undefined ? sourceStartMs - sourceDurationMs : undefined });
				} else {
					_excludedMidTimelineElements++;
				}
			}

			const templateZooms: EditorPresetSnapshot["templateZooms"] = [];
			for (const region of timeline.zoomRegions) {
				if (region.startMs === 0) {
					const { startMs, endMs, ...rest } = region;
					templateZooms.push({ ...rest, anchor: { reference: "start", offsetMs: 0 }, durationMs: endMs - startMs });
				} else if (region.endMs === timelineDurationMs) {
					const { startMs, endMs, ...rest } = region;
					templateZooms.push({ ...rest, anchor: { reference: "end", offsetMs: startMs - timelineDurationMs }, durationMs: endMs - startMs });
				} else {
					_excludedMidTimelineElements++;
				}
			}

			const templateAnnotations: EditorPresetSnapshot["templateAnnotations"] = [];
			for (const region of timeline.annotationRegions) {
				if (region.type === "image" && region.imageContent?.startsWith("blob:")) {
					_excludedCustomAssets++;
					continue;
				}
				if (region.startMs === 0) {
					const { startMs, endMs, ...rest } = region;
					templateAnnotations.push({ ...rest, anchor: { reference: "start", offsetMs: 0 }, durationMs: endMs - startMs });
				} else if (region.endMs === timelineDurationMs) {
					const { startMs, endMs, ...rest } = region;
					templateAnnotations.push({ ...rest, anchor: { reference: "end", offsetMs: startMs - timelineDurationMs }, durationMs: endMs - startMs });
				} else {
					_excludedMidTimelineElements++;
				}
			}

			const templateAudios: EditorPresetSnapshot["templateAudios"] = [];
			for (const region of timeline.audioRegions) {
				if (region.audioPath.startsWith("blob:") || region.audioPath.startsWith("opfs:/")) {
					_excludedCustomAssets++;
					continue;
				}
				if (region.startMs === 0) {
					const { startMs, endMs, ...rest } = region;
					templateAudios.push({ ...rest, anchor: { reference: "start", offsetMs: 0 }, durationMs: endMs - startMs });
				} else if (region.endMs === timelineDurationMs) {
					const { startMs, endMs, ...rest } = region;
					templateAudios.push({ ...rest, anchor: { reference: "end", offsetMs: startMs - timelineDurationMs }, durationMs: endMs - startMs });
				} else {
					_excludedMidTimelineElements++;
				}
			}

			return {
				wallpaper: appearance.wallpaper,
				shadowIntensity: appearance.shadowIntensity,
				backgroundBlur: appearance.backgroundBlur,
				zoomMotionBlur: appearance.zoomMotionBlur,
				zoomMotionBlurTuning: { ...appearance.zoomMotionBlurTuning },
				connectZooms: appearance.connectZooms,
				zoomInDurationMs: appearance.zoomInDurationMs,
				zoomInOverlapMs: appearance.zoomInOverlapMs,
				zoomOutDurationMs: appearance.zoomOutDurationMs,
				connectedZoomGapMs: appearance.connectedZoomGapMs,
				connectedZoomDurationMs: appearance.connectedZoomDurationMs,
				zoomInEasing: appearance.zoomInEasing,
				zoomOutEasing: appearance.zoomOutEasing,
				connectedZoomEasing: appearance.connectedZoomEasing,
				showCursor: appearance.showCursor,
				loopCursor: appearance.loopCursor,
				cursorStyle: appearance.cursorStyle,
				cursorSize: appearance.cursorSize,
				cursorSmoothing: appearance.cursorSmoothing,
				cursorSpringStiffnessMultiplier: appearance.cursorSpringStiffnessMultiplier,
				cursorSpringDampingMultiplier: appearance.cursorSpringDampingMultiplier,
				cursorSpringMassMultiplier: appearance.cursorSpringMassMultiplier,
				cameraSpringStiffnessMultiplier: appearance.cameraSpringStiffnessMultiplier,
				cameraSpringDampingMultiplier: appearance.cameraSpringDampingMultiplier,
				cameraSpringMassMultiplier: appearance.cameraSpringMassMultiplier,
				cursorMotionBlur: appearance.cursorMotionBlur,
				cursorClickEffect: appearance.cursorClickEffect,
				cursorClickEffectColor: appearance.cursorClickEffectColor,
				cursorClickEffectScale: appearance.cursorClickEffectScale,
				cursorClickEffectOpacity: appearance.cursorClickEffectOpacity,
				cursorClickEffectDurationMs: appearance.cursorClickEffectDurationMs,
				cursorClickBounce: appearance.cursorClickBounce,
				cursorClickBounceDuration: appearance.cursorClickBounceDuration,
				cursorSway: appearance.cursorSway,
				borderRadius: appearance.borderRadius,
				borderRadiusUnit: "percent",
				padding: { ...appearance.padding },
				cropRegion: { ...appearance.cropRegion },
				webcam: (({ sourcePath: _sourcePath, ...settings }) => settings)(appearance.webcam),
				aspectRatio,
				exportEncodingMode: exportSettings.exportEncodingMode,
				exportBackendPreference: exportSettings.exportBackendPreference,
				exportPipelineModel: exportSettings.exportPipelineModel,
				exportQuality: exportSettings.exportQuality,
				mp4FrameRate: exportSettings.mp4FrameRate,
				exportFormat: exportSettings.exportFormat,
				gifFrameRate: exportSettings.gifFrameRate,
				gifLoop: exportSettings.gifLoop,
				gifSizePreset: exportSettings.gifSizePreset,
				autoCaptionSettings: { ...timeline.autoCaptionSettings },
				templateClips,
				templateZooms,
				templateAnnotations,
				templateAudios,
				_excludedMidTimelineElements,
				_excludedCustomAssets,
			};
		},
		[
			appearance,
			timeline.autoCaptionSettings,
			timeline.clipRegions,
			timeline.zoomRegions,
			timeline.annotationRegions,
			timeline.audioRegions,
			exportSettings,
			aspectRatio,
			timelineDurationMs,
			sourceDurationMs,
		],
	);

	const applySnapshot = useCallback(
		(snapshot: EditorPresetSnapshot) => {
			appearance.setWallpaper(snapshot.wallpaper);
			appearance.setShadowIntensity(snapshot.shadowIntensity);
			appearance.setBackgroundBlur(snapshot.backgroundBlur);
			appearance.setZoomMotionBlur(snapshot.zoomMotionBlur);
			appearance.setZoomMotionBlurTuning({ ...snapshot.zoomMotionBlurTuning });
			appearance.setConnectZooms(snapshot.connectZooms);
			appearance.setZoomInDurationMs(snapshot.zoomInDurationMs);
			appearance.setZoomInOverlapMs(snapshot.zoomInOverlapMs);
			appearance.setZoomOutDurationMs(snapshot.zoomOutDurationMs);
			appearance.setConnectedZoomGapMs(snapshot.connectedZoomGapMs);
			appearance.setConnectedZoomDurationMs(snapshot.connectedZoomDurationMs);
			appearance.setZoomInEasing(snapshot.zoomInEasing);
			appearance.setZoomOutEasing(snapshot.zoomOutEasing);
			appearance.setConnectedZoomEasing(snapshot.connectedZoomEasing);
			appearance.setShowCursor(snapshot.showCursor);
			appearance.setLoopCursor(snapshot.loopCursor);
			appearance.setCursorStyle(snapshot.cursorStyle);
			appearance.setCursorSize(snapshot.cursorSize);
			appearance.setCursorSmoothing(snapshot.cursorSmoothing);
			appearance.setCursorSpringStiffnessMultiplier(snapshot.cursorSpringStiffnessMultiplier);
			appearance.setCursorSpringDampingMultiplier(snapshot.cursorSpringDampingMultiplier);
			appearance.setCursorSpringMassMultiplier(snapshot.cursorSpringMassMultiplier);
			appearance.setCameraSpringStiffnessMultiplier(snapshot.cameraSpringStiffnessMultiplier);
			appearance.setCameraSpringDampingMultiplier(snapshot.cameraSpringDampingMultiplier);
			appearance.setCameraSpringMassMultiplier(snapshot.cameraSpringMassMultiplier);
			appearance.setCursorMotionBlur(snapshot.cursorMotionBlur);
			appearance.setCursorClickEffect(snapshot.cursorClickEffect);
			appearance.setCursorClickEffectColor(snapshot.cursorClickEffectColor);
			appearance.setCursorClickEffectScale(snapshot.cursorClickEffectScale);
			appearance.setCursorClickEffectOpacity(snapshot.cursorClickEffectOpacity);
			appearance.setCursorClickEffectDurationMs(snapshot.cursorClickEffectDurationMs);
			appearance.setCursorClickBounce(snapshot.cursorClickBounce);
			appearance.setCursorClickBounceDuration(snapshot.cursorClickBounceDuration);
			appearance.setCursorSway(snapshot.cursorSway);
			appearance.setBorderRadius(snapshot.borderRadius);
			appearance.setPadding({ ...snapshot.padding });
			appearance.setCropRegion({ ...snapshot.cropRegion });
			appearance.setWebcam((current) => ({
				...snapshot.webcam,
				sourcePath: current.sourcePath,
			}));
			setAspectRatio(snapshot.aspectRatio);
			exportSettings.setExportEncodingMode(snapshot.exportEncodingMode);
			exportSettings.setExportBackendPreference(snapshot.exportBackendPreference);
			exportSettings.setExportPipelineModel(snapshot.exportPipelineModel);
			exportSettings.setExportQuality(snapshot.exportQuality);
			exportSettings.setMp4FrameRate(snapshot.mp4FrameRate);
			exportSettings.setExportFormat(snapshot.exportFormat);
			exportSettings.setGifFrameRate(snapshot.gifFrameRate);
			exportSettings.setGifLoop(snapshot.gifLoop);
			exportSettings.setGifSizePreset(snapshot.gifSizePreset);
			timeline.setAutoCaptionSettings({ ...snapshot.autoCaptionSettings });

			if (snapshot.templateClips?.length > 0) {
				timeline.setClipRegions(snapshot.templateClips.map((t) => {
					const { anchor, durationMs, sourceOffsetMs, ...rest } = t;
					let startMs = anchor.reference === "start" ? anchor.offsetMs : timelineDurationMs + anchor.offsetMs;
					let endMs = startMs + durationMs;
					// Note: on very short videos, clamped start/end anchored regions may overlap or fully cover the timeline. This is a known limitation.
					if (startMs < 0) startMs = 0;
					if (endMs > timelineDurationMs) endMs = timelineDurationMs;
					const sourceStartMs = sourceOffsetMs !== undefined 
						? (anchor.reference === "start" ? sourceOffsetMs : sourceDurationMs + sourceOffsetMs) 
						: undefined;
					return { ...rest, startMs, endMs, sourceStartMs };
				}));
			}

			if (snapshot.templateZooms?.length > 0) {
				timeline.setZoomRegions(snapshot.templateZooms.map((t) => {
					const { anchor, durationMs, ...rest } = t;
					let startMs = anchor.reference === "start" ? anchor.offsetMs : timelineDurationMs + anchor.offsetMs;
					let endMs = startMs + durationMs;
					// Note: on very short videos, clamped start/end anchored regions may overlap or fully cover the timeline. This is a known limitation.
					if (startMs < 0) startMs = 0;
					if (endMs > timelineDurationMs) endMs = timelineDurationMs;
					return { ...rest, startMs, endMs };
				}));
			}

			if (snapshot.templateAnnotations?.length > 0) {
				timeline.setAnnotationRegions(snapshot.templateAnnotations.map((t) => {
					const { anchor, durationMs, ...rest } = t;
					let startMs = anchor.reference === "start" ? anchor.offsetMs : timelineDurationMs + anchor.offsetMs;
					let endMs = startMs + durationMs;
					// Note: on very short videos, clamped start/end anchored regions may overlap or fully cover the timeline. This is a known limitation.
					if (startMs < 0) startMs = 0;
					if (endMs > timelineDurationMs) endMs = timelineDurationMs;
					return { ...rest, startMs, endMs };
				}));
			}

			if (snapshot.templateAudios?.length > 0) {
				timeline.setAudioRegions(snapshot.templateAudios.map((t) => {
					const { anchor, durationMs, ...rest } = t;
					let startMs = anchor.reference === "start" ? anchor.offsetMs : timelineDurationMs + anchor.offsetMs;
					let endMs = startMs + durationMs;
					// Note: on very short videos, clamped start/end anchored regions may overlap or fully cover the timeline. This is a known limitation.
					if (startMs < 0) startMs = 0;
					if (endMs > timelineDurationMs) endMs = timelineDurationMs;
					return { ...rest, startMs, endMs };
				}));
			}
		},
		[
			appearance,
			exportSettings,
			timeline,
			setAspectRatio,
			timelineDurationMs,
			sourceDurationMs,
		],
	);

	const actions = useEditorPresets({
		t,
		currentSnapshot,
		applySnapshot,
		editorPresets,
		setEditorPresets,
		activePresetId: activeEditorPresetId,
		setActivePresetId: setActiveEditorPresetId,
		presetPopoverOpen,
		presetNameDraft,
		setPresetNameDraft,
	});
	return {
		editorPresets,
		activeEditorPresetId,
		presetPopoverOpen,
		setPresetPopoverOpen,
		presetNameDraft,
		setPresetNameDraft,
		...actions,
	};
}
