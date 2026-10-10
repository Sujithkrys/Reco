import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import type { TimelineSelectionKind } from "../state/timelineSelection";
import {
	clampFocusToDepth,
	DEFAULT_AUTO_ZOOM_DEPTH,
	type EditorEffectSection,
	type ZoomDepth,
	type ZoomFocus,
	type ZoomMode,
	type ZoomRegion,
} from "../types";

interface UseZoomRegionCommandsParams {
	videoPath: string | null;
	setZoomRegions: Dispatch<SetStateAction<ZoomRegion[]>>;
	selectedZoomId: string | null;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	/** Deselects every other timeline item (selection is exclusive). */
	clearOtherSelections: (keep: TimelineSelectionKind) => void;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	nextZoomIdRef: MutableRefObject<number>;
	autoSuggestedVideoPathRef: MutableRefObject<string | null>;
	pendingFreshRecordingAutoZoomPathRef: MutableRefObject<string | null>;
}

export function useZoomRegionCommands({
	videoPath,
	setZoomRegions,
	selectedZoomId,
	setSelectedZoomId,
	clearOtherSelections,
	setActiveEffectSection,
	nextZoomIdRef,
	autoSuggestedVideoPathRef,
	pendingFreshRecordingAutoZoomPathRef,
}: UseZoomRegionCommandsParams) {
	const handleSelectZoom = useCallback(
		(id: string | null) => {
			setSelectedZoomId(id);
			if (id) {
				setActiveEffectSection("zoom");
				clearOtherSelections("zoom");
			} else {
				setActiveEffectSection((section) => (section === "zoom" ? "scene" : section));
			}
		},
		[clearOtherSelections, setActiveEffectSection, setSelectedZoomId],
	);

	const markFreshRecordingSuggestion = useCallback(() => {
		if (videoPath && pendingFreshRecordingAutoZoomPathRef.current === videoPath) {
			autoSuggestedVideoPathRef.current = videoPath;
			pendingFreshRecordingAutoZoomPathRef.current = null;
		}
	}, [autoSuggestedVideoPathRef, pendingFreshRecordingAutoZoomPathRef, videoPath]);

	const handleZoomAdded = useCallback(
		(span: Span) => {
			const id = `zoom-${nextZoomIdRef.current++}`;
			const depth: ZoomDepth = 2;
			const newRegion: ZoomRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				depth,
				focus: clampFocusToDepth({ cx: 0.5, cy: 0.5 }, depth),
				// Mode describes camera tracking behavior, not how the region was created.
				mode: "auto",
			};
			markFreshRecordingSuggestion();
			setZoomRegions((current) => [...current, newRegion]);
			setSelectedZoomId(id);
			clearOtherSelections("zoom");
		},
		[
			clearOtherSelections,
			markFreshRecordingSuggestion,
			nextZoomIdRef,
			setSelectedZoomId,
			setZoomRegions,
		],
	);

	const handleZoomSuggested = useCallback(
		(span: Span, focus: ZoomFocus) => {
			const newRegion: ZoomRegion = {
				id: `zoom-${nextZoomIdRef.current++}`,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				depth: DEFAULT_AUTO_ZOOM_DEPTH,
				focus: clampFocusToDepth(focus, DEFAULT_AUTO_ZOOM_DEPTH),
				mode: "auto",
			};
			markFreshRecordingSuggestion();
			setZoomRegions((current) => [...current, newRegion]);
		},
		[markFreshRecordingSuggestion, nextZoomIdRef, setZoomRegions],
	);

	const handleZoomSpanChange = useCallback(
		(id: string, span: Span) => {
			setZoomRegions((current) =>
				current.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			);
		},
		[setZoomRegions],
	);
	const handleZoomFocusChange = useCallback(
		(id: string, focus: ZoomFocus) => {
			setZoomRegions((current) =>
				current.map((region) =>
					region.id === id
						? { ...region, focus: clampFocusToDepth(focus, region.depth) }
						: region,
				),
			);
		},
		[setZoomRegions],
	);
	const handleZoomDepthChange = useCallback(
		(depth: ZoomDepth) => {
			if (!selectedZoomId) return;
			setZoomRegions((current) =>
				current.map((region) =>
					region.id === selectedZoomId
						? { ...region, depth, focus: clampFocusToDepth(region.focus, depth) }
						: region,
				),
			);
		},
		[selectedZoomId, setZoomRegions],
	);
	const handleZoomModeChange = useCallback(
		(mode: ZoomMode) => {
			if (!selectedZoomId) return;
			setZoomRegions((current) =>
				current.map((region) =>
					region.id === selectedZoomId ? { ...region, mode } : region,
				),
			);
		},
		[selectedZoomId, setZoomRegions],
	);
	const handleZoomDelete = useCallback(
		(id: string) => {
			setZoomRegions((current) => current.filter((region) => region.id !== id));
			if (selectedZoomId === id) setSelectedZoomId(null);
		},
		[selectedZoomId, setSelectedZoomId, setZoomRegions],
	);

	return {
		handleSelectZoom,
		handleZoomAdded,
		handleZoomSuggested,
		handleZoomSpanChange,
		handleZoomFocusChange,
		handleZoomDepthChange,
		handleZoomModeChange,
		handleZoomDelete,
	};
}
