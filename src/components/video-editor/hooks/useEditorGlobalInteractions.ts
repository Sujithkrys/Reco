import { type RefObject, useEffect, useRef } from "react";
import type { useShortcuts } from "@/contexts/ShortcutsContext";
import { matchesRedo, matchesShortcut } from "@/lib/shortcuts";
import { isEditableTarget } from "../layerKeyboard";
import { mapPlaybackKey, seekTargetSeconds } from "../playbackKeys";
import { clearAllTimelineSelections } from "../state/timelineSelection";
import type { useTimelineState } from "../state/useTimelineState";
import type { VideoPlaybackRef } from "../VideoPlayback";

type Input = {
	timeline: ReturnType<typeof useTimelineState>;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	shortcuts: ReturnType<typeof useShortcuts>["shortcuts"];
	isMac: boolean;
	handleUndo: () => void;
	handleRedo: () => void;
	startPlayback: () => void;
		/** Playhead and length of the timeline in seconds, and a seek, for the arrow keys. */
		playheadSeconds: number;
		durationSeconds: number;
		seekTo: (seconds: number, options?: { pause?: boolean }) => void;
	};

/** A menu or dialog has the keyboard: its own arrow keys apply. */
function isInsideOverlay(target: HTMLElement | null): boolean {
	return Boolean(target?.closest?.("[role='menu'], [role='dialog'], [role='listbox']"));
}

/** Moves keyboard focus off whatever had it and onto the player. */
function focusPlayer() {
	const frame = document.querySelector<HTMLElement>("[data-preview-frame]");
	if (!frame) return;
	frame.focus({ preventScroll: true });
}

export function useEditorGlobalInteractions({
	timeline,
	videoPlaybackRef,
	shortcuts,
	isMac,
	handleUndo,
	handleRedo,
	startPlayback,
		playheadSeconds,
		durationSeconds,
		seekTo,
	}: Input) {
		const latest = useRef({ playheadSeconds, durationSeconds, seekTo, selectedAnnotationId: timeline.selectedAnnotationId });
		latest.current = { playheadSeconds, durationSeconds, seekTo, selectedAnnotationId: timeline.selectedAnnotationId };
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const editable =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target?.isContentEditable;
			const primaryModifier = isMac ? event.metaKey : event.ctrlKey;
			const key = event.key.toLowerCase();
			// The canvas text editor has no undo of its own: its typing and styling are app history steps.
			const inRichTextEditor = Boolean(target?.closest?.("[data-rich-text-editor]"));

			if (matchesShortcut(event, shortcuts.undo, isMac)) {
				if (!editable || inRichTextEditor) {
					event.preventDefault();
					handleUndo();
				}
				return;
			}
			if (matchesRedo(event, shortcuts.redo, isMac)) {
				if (!editable || inRichTextEditor) {
					event.preventDefault();
					handleRedo();
				}
				return;
			}
			const seek = mapPlaybackKey({
				key: event.key,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				shiftKey: event.shiftKey,
				altKey: event.altKey,
				editable: Boolean(editable) || isEditableTarget(event.target) || isInsideOverlay(target),
				hasLayerSelected: latest.current.selectedAnnotationId !== null,
			});
			if (seek) {
				event.preventDefault();
				const playback = videoPlaybackRef.current;
				if (!playback?.video) return;
				const to = seekTargetSeconds(latest.current.playheadSeconds, seek, latest.current.durationSeconds);
				latest.current.seekTo(to, { pause: true });
				return;
			}
			if (!matchesShortcut(event, shortcuts.playPause, isMac) || editable) return;
			event.preventDefault();
			const playback = videoPlaybackRef.current;
			if (!playback?.video) return;
			if (!playback.isPlaying) startPlayback();
			else playback.pause();
			// Space also clears every layer selection and hands focus back to the player, so the arrow
			// keys act on the clip and a focused button is not pressed by the same key.
			clearAllTimelineSelections({
				setSelectedZoomId: timeline.setSelectedZoomId,
				setSelectedClipId: timeline.setSelectedClipId,
				setSelectedAnnotationId: timeline.setSelectedAnnotationId,
				setSelectedAudioId: timeline.setSelectedAudioId,
				setSelectedCaptionId: timeline.setSelectedCaptionId,
				setSelectedGeneratedClipId: timeline.setSelectedGeneratedClipId,
			});
			focusPlayer();
		};
		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [shortcuts, isMac, handleUndo, handleRedo, startPlayback, videoPlaybackRef]);

	useEffect(() => {
		if (
			timeline.selectedZoomId &&
			!timeline.zoomRegions.some(({ id }) => id === timeline.selectedZoomId)
		) {
			timeline.setSelectedZoomId(null);
		}
	}, [timeline.selectedZoomId, timeline.zoomRegions, timeline.setSelectedZoomId]);
	useEffect(() => {
		if (
			timeline.selectedAnnotationId &&
			!timeline.annotationRegions.some(({ id }) => id === timeline.selectedAnnotationId)
		) {
			timeline.setSelectedAnnotationId(null);
		}
	}, [
		timeline.selectedAnnotationId,
		timeline.annotationRegions,
		timeline.setSelectedAnnotationId,
	]);
	useEffect(() => {
		if (
			timeline.selectedAudioId &&
			!timeline.audioRegions.some(({ id }) => id === timeline.selectedAudioId)
		) {
			timeline.setSelectedAudioId(null);
		}
	}, [timeline.selectedAudioId, timeline.audioRegions, timeline.setSelectedAudioId]);
	useEffect(() => {
		if (
			timeline.selectedCaptionId &&
			!timeline.autoCaptions.some(({ id }) => id === timeline.selectedCaptionId)
		) {
			timeline.setSelectedCaptionId(null);
		}
	}, [timeline.selectedCaptionId, timeline.autoCaptions, timeline.setSelectedCaptionId]);
}
