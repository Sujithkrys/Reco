import { type RefObject, useEffect, useRef } from "react";
import { toast } from "sonner";
import { matchesShortcut } from "@/lib/shortcuts";
import type { TimelineShortcutBindings } from "../core/timelineTypes";
import { resolveDeleteSelectionTarget } from "./utils/timelineSelectionUtils";

interface UseTimelineKeyboardShortcutsParams {
	isMac: boolean;
	keyShortcuts: TimelineShortcutBindings;
	isTimelineFocusedRef: RefObject<boolean>;
	hasAnyZoomBlocks: boolean;
	activateSelectAllZooms: () => void;
	zoomTimelineIn: () => void;
	zoomTimelineOut: () => void;
	annotationCount: number;
	currentTimeMs?: number;
	annotationRegions?: Array<{ id: string; startMs: number; endMs: number }>;
	audioRegions?: Array<{ id: string; startMs: number; endMs: number }>;
	captionCues?: Array<{ id: string; startMs: number; endMs: number }>;
	selectedKeyframeId: string | null;
	selectedZoomId: string | null;
	selectedClipId?: string | null;
	selectedAnnotationId?: string | null;
	selectedAudioId?: string | null;
	selectedCaptionId?: string | null;
	selectAllBlocksActive: boolean;
	addKeyframe: () => void;
	handleAddZoom: () => void;
	handleSplitClip: () => void;
	handleAddAnnotation: () => void;
	deleteSelectedKeyframe: () => void;
	deleteSelectedZoom: () => void;
	deleteSelectedClip: () => void;
	deleteSelectedAnnotation: () => void;
	deleteSelectedAudio: () => void;
	deleteSelectedCaption: () => void;
	cycleAnnotationsAtCurrentTime: (backward?: boolean) => boolean;
}

export function useTimelineKeyboardShortcuts({
	isMac,
	keyShortcuts,
	isTimelineFocusedRef,
	hasAnyZoomBlocks,
	activateSelectAllZooms,
	zoomTimelineIn,
	zoomTimelineOut,
	annotationCount,
	currentTimeMs,
	annotationRegions,
	audioRegions,
	captionCues,
	selectedKeyframeId,
	selectedZoomId,
	selectedClipId,
	selectedAnnotationId,
	selectedAudioId,
	selectedCaptionId,
	selectAllBlocksActive,
	addKeyframe,
	handleAddZoom,
	handleSplitClip,
	handleAddAnnotation,
	deleteSelectedKeyframe,
	deleteSelectedZoom,
	deleteSelectedClip,
	deleteSelectedAnnotation,
	deleteSelectedAudio,
	deleteSelectedCaption,
	cycleAnnotationsAtCurrentTime,
}: UseTimelineKeyboardShortcutsParams) {
	const currentTimeMsRef = useRef(currentTimeMs);
	currentTimeMsRef.current = currentTimeMs;
	const annotationRegionsRef = useRef(annotationRegions);
	annotationRegionsRef.current = annotationRegions;
	const audioRegionsRef = useRef(audioRegions);
	audioRegionsRef.current = audioRegions;
	const captionCuesRef = useRef(captionCues);
	captionCuesRef.current = captionCues;

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented) return;
			const eventTarget = e.target;
			if (
				eventTarget instanceof HTMLInputElement ||
				eventTarget instanceof HTMLTextAreaElement ||
				eventTarget instanceof HTMLSelectElement ||
				(eventTarget instanceof HTMLElement && eventTarget.isContentEditable)
			) {
				return;
			}

			if (selectedClipId && e.key === "Backspace" && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				deleteSelectedClip();
				return;
			}

			if (!isTimelineFocusedRef.current) {
				return;
			}

			if (matchesShortcut(e, { key: "a", ctrl: true }, isMac)) {
				if (!hasAnyZoomBlocks) {
					return;
				}
				e.preventDefault();
				activateSelectAllZooms();
				return;
			}

			if (matchesShortcut(e, keyShortcuts.addKeyframe, isMac)) addKeyframe();
			if (matchesShortcut(e, keyShortcuts.addZoom, isMac)) handleAddZoom();
			if (matchesShortcut(e, keyShortcuts.splitClip, isMac)) handleSplitClip();
			if (matchesShortcut(e, keyShortcuts.addAnnotation, isMac)) {
				handleAddAnnotation();
			}

			if (matchesShortcut(e, keyShortcuts.zoomIn, isMac)) {
				e.preventDefault();
				zoomTimelineIn();
			}
			if (matchesShortcut(e, keyShortcuts.zoomOut, isMac)) {
				e.preventDefault();
				zoomTimelineOut();
			}

			if (e.key === "Tab" && annotationCount > 0) {
				if (cycleAnnotationsAtCurrentTime(e.shiftKey)) {
					e.preventDefault();
				}
			}

			if (
				e.key === "Delete" ||
				e.key === "Backspace" ||
				matchesShortcut(e, keyShortcuts.deleteSelected, isMac)
			) {
				const target = resolveDeleteSelectionTarget({
					selectAllBlocksActive,
					selectedKeyframeId,
					selectedZoomId,
					selectedClipId,
					selectedAnnotationId,
					selectedAudioId,
					selectedCaptionId,
				});
				if (target !== "none") {
					e.preventDefault();
				}
				const currentTime = currentTimeMsRef.current;
				if (target === "keyframe") {
					deleteSelectedKeyframe();
				} else if (target === "zoom") {
					deleteSelectedZoom();
				} else if (target === "clip") {
					deleteSelectedClip();
				} else if (target === "annotation") {
					if (selectedAnnotationId && currentTime !== undefined && annotationRegionsRef.current) {
						const item = annotationRegionsRef.current.find((a) => a.id === selectedAnnotationId);
						if (item && (currentTime < item.startMs || currentTime > item.endMs)) {
							toast("Move the playhead onto the layer to delete it, or use the Delete button in its settings.");
							return;
						}
					}
					deleteSelectedAnnotation();
				} else if (target === "audio") {
					if (selectedAudioId && currentTime !== undefined && audioRegionsRef.current) {
						const item = audioRegionsRef.current.find((a) => a.id === selectedAudioId);
						if (item && (currentTime < item.startMs || currentTime > item.endMs)) {
							toast("Move the playhead onto the layer to delete it, or use the Delete button in its settings.");
							return;
						}
					}
					deleteSelectedAudio();
				} else if (target === "caption") {
					if (selectedCaptionId && currentTime !== undefined && captionCuesRef.current) {
						const item = captionCuesRef.current.find((c) => c.id === selectedCaptionId);
						if (item && (currentTime < item.startMs || currentTime > item.endMs)) {
							toast("Move the playhead onto the layer to delete it, or use the Delete button in its settings.");
							return;
						}
					}
					deleteSelectedCaption();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		activateSelectAllZooms,
		zoomTimelineIn,
		zoomTimelineOut,
		addKeyframe,
		annotationCount,
		cycleAnnotationsAtCurrentTime,
		deleteSelectedAnnotation,
		deleteSelectedAudio,
		deleteSelectedCaption,
		deleteSelectedClip,
		deleteSelectedKeyframe,
		deleteSelectedZoom,
		handleAddAnnotation,
		handleAddZoom,
		handleSplitClip,
		hasAnyZoomBlocks,
		isMac,
		isTimelineFocusedRef,
		keyShortcuts,
		selectAllBlocksActive,
		selectedAnnotationId,
		selectedAudioId,
		selectedCaptionId,
		selectedClipId,
		selectedKeyframeId,
		selectedZoomId,
	]);
}
