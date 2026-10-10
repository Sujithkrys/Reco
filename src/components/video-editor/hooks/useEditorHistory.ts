import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import {
	areEditorHistorySnapshotsEqual,
	createEditorHistoryStack,
	type EditorHistorySnapshot,
	recordEditorHistorySnapshot,
	redoEditorHistoryStack,
	resetEditorHistoryStack,
	undoEditorHistoryStack,
} from "../editorHistory";
import { deriveNextId } from "../projectPersistence";
import type { useTimelineState } from "../state/useTimelineState";
import { cloneStructured } from "../videoEditorUtils";

type Input = {
	timeline: ReturnType<typeof useTimelineState>;
	nextZoomIdRef: MutableRefObject<number>;
	nextClipIdRef: MutableRefObject<number>;
	nextAnnotationIdRef: MutableRefObject<number>;
	nextAudioIdRef: MutableRefObject<number>;
	nextAnnotationZIndexRef: MutableRefObject<number>;
};

export function useEditorHistory({
	timeline,
	nextZoomIdRef,
	nextClipIdRef,
	nextAnnotationIdRef,
	nextAudioIdRef,
	nextAnnotationZIndexRef,
}: Input) {
	const {
		zoomRegions,
		clipRegions,
		speedRegions,
		annotationRegions,
		audioRegions,
		autoCaptions,
		selectedZoomId,
		selectedClipId,
		selectedAnnotationId,
		selectedAudioId,
		setZoomRegions,
		setClipRegions,
		setSpeedRegions,
		setAnnotationRegions,
		setAudioRegions,
		setAutoCaptions,
		setSelectedZoomId,
		setSelectedClipId,
		setSelectedAnnotationId,
		setSelectedAudioId,
	} = timeline;
	const historyRef = useRef(createEditorHistoryStack());
	const applyingRef = useRef(false);
	// Set when the timeline clamps regions after another change; the clamp then
	// replaces the current step rather than becoming a step of its own (which
	// undo would restore, re-trigger the clamp, and never get past). The first
	// real change consumes it, and it expires so it cannot absorb a later edit.
	const amendUntilRef = useRef(0);
	const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
	const syncButtons = useCallback(() => {
		const next = {
			canUndo: historyRef.current.past.length > 0,
			canRedo: historyRef.current.future.length > 0,
		};
		setHistoryFlags((current) =>
			current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next,
		);
	}, []);
	const buildSnapshot = useCallback(
		(): EditorHistorySnapshot => ({
			zoomRegions,
			clipRegions,
			speedRegions,
			annotationRegions,
			audioRegions,
			autoCaptions,
			selectedZoomId,
			selectedClipId,
			selectedAnnotationId,
			selectedAudioId,
		}),
		[
			zoomRegions,
			clipRegions,
			speedRegions,
			annotationRegions,
			audioRegions,
			autoCaptions,
			selectedZoomId,
			selectedClipId,
			selectedAnnotationId,
			selectedAudioId,
		],
	);
	const applySnapshot = useCallback(
		(snapshot: EditorHistorySnapshot) => {
			applyingRef.current = true;
			const cloned = cloneStructured(snapshot);
			setZoomRegions(cloned.zoomRegions);
			setClipRegions(cloned.clipRegions);
			setSpeedRegions(cloned.speedRegions);
			setAnnotationRegions(cloned.annotationRegions);
			setAudioRegions(cloned.audioRegions);
			setAutoCaptions(cloned.autoCaptions);
			setSelectedZoomId(cloned.selectedZoomId);
			setSelectedClipId(cloned.selectedClipId);
			setSelectedAnnotationId(cloned.selectedAnnotationId);
			setSelectedAudioId(cloned.selectedAudioId);
			nextZoomIdRef.current = deriveNextId(
				"zoom",
				cloned.zoomRegions.map(({ id }) => id),
			);
			nextClipIdRef.current = deriveNextId(
				"clip",
				cloned.clipRegions.map(({ id }) => id),
			);
			nextAnnotationIdRef.current = deriveNextId(
				"annotation",
				cloned.annotationRegions.map(({ id }) => id),
			);
			nextAudioIdRef.current = deriveNextId(
				"audio",
				cloned.audioRegions.map(({ id }) => id),
			);
			nextAnnotationZIndexRef.current =
				cloned.annotationRegions.reduce((max, region) => Math.max(max, region.zIndex), 0) +
				1;
		},
		[
			setZoomRegions,
			setClipRegions,
			setSpeedRegions,
			setAnnotationRegions,
			setAudioRegions,
			setAutoCaptions,
			setSelectedZoomId,
			setSelectedClipId,
			setSelectedAnnotationId,
			setSelectedAudioId,
			nextZoomIdRef,
			nextClipIdRef,
			nextAnnotationIdRef,
			nextAudioIdRef,
			nextAnnotationZIndexRef,
		],
	);
	const handleUndo = useCallback(() => {
		const previous = undoEditorHistoryStack(historyRef.current, buildSnapshot());
		if (previous) {
			applySnapshot(previous);
			syncButtons();
		}
	}, [applySnapshot, buildSnapshot, syncButtons]);
	const handleRedo = useCallback(() => {
		const next = redoEditorHistoryStack(historyRef.current, buildSnapshot());
		if (next) {
			applySnapshot(next);
			syncButtons();
		}
	}, [applySnapshot, buildSnapshot, syncButtons]);
	const resetHistory = useCallback(() => {
		resetEditorHistoryStack(historyRef.current);
		applyingRef.current = false;
		syncButtons();
	}, [syncButtons]);

	const buildSnapshotRef = useRef(buildSnapshot);
	buildSnapshotRef.current = buildSnapshot;

	const recordSnapshot = useCallback(
		(snapshot: EditorHistorySnapshot) => {
			// Only an actual change may use up a pending amend.
			const amending =
				amendUntilRef.current > Date.now() &&
				!(
					historyRef.current.current &&
					areEditorHistorySnapshotsEqual(historyRef.current.current, snapshot)
				);
			const result = recordEditorHistorySnapshot(historyRef.current, snapshot, {
				applyingHistory: applyingRef.current || amending,
			});
			if (result === "applied") {
				applyingRef.current = false;
				amendUntilRef.current = 0;
			}
			if (result !== "unchanged") syncButtons();
		},
		[syncButtons],
	);

	// The timeline calls this from its own effect, which runs before ours in the
	// same commit: record the edit that caused the clamp first, so only the
	// clamp itself (the next change) is folded into it.
	const amendCurrentStep = useCallback(() => {
		recordSnapshot(buildSnapshotRef.current());
		// The clamp's own render can be slow (the preview re-lays out), so allow
		// it a second; the first real change after this consumes the amend.
		amendUntilRef.current = Date.now() + 1000;
	}, [recordSnapshot]);

	useEffect(() => {
		recordSnapshot(buildSnapshot());
	}, [buildSnapshot, recordSnapshot]);

	return {
		...historyFlags,
		handleUndo,
		handleRedo,
		resetHistory,
		amendCurrentStep,
	};
}
