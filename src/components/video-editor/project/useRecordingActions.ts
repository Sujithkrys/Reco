import {
	type Dispatch,
	type MutableRefObject,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useNativeScreenRecording } from "@/hooks/useNativeScreenRecording";
import type { NativeRecordingResult } from "@/hooks/useNativeScreenRecording";
import { cursorTelemetryMap, webBlobMap } from "@/lib/webElectronAPI";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useProjectState } from "../state/useProjectState";
import { DEFAULT_WEBCAM_TIME_OFFSET_MS } from "../types";
import type { VideoPlaybackRef } from "../VideoPlayback";

type Set<T> = Dispatch<SetStateAction<T>>;

type UseRecordingActionsInput = {
	project: ReturnType<typeof useProjectState>;
	appearance: ReturnType<typeof useAppearanceState>;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	pendingFreshRecordingAutoZoomPathRef: MutableRefObject<string | null>;
	hasUnsavedChanges: boolean;
	setIsPlaying: Set<boolean>;
	setCurrentTime: Set<number>;
	setDuration: Set<number>;
	openUnsavedChangesDialog: (actionLabel: string) => Promise<"save" | "discard" | "cancel">;
	saveProject: (forceSaveAs: boolean) => Promise<boolean>;
	resetSourceScopedEditorState: () => void;
	applySessionPresentation: (session: null) => void;
};

export function useRecordingActions({
	project,
	appearance,
	videoPlaybackRef,
	pendingFreshRecordingAutoZoomPathRef,
	hasUnsavedChanges,
	setIsPlaying,
	setCurrentTime,
	setDuration,
	openUnsavedChangesDialog,
	saveProject,
	resetSourceScopedEditorState,
	applySessionPresentation,
}: UseRecordingActionsInput) {
	const [launcherOpen, setLauncherOpen] = useState(false);
	// Only probe for camera/mic devices while the launcher is actually open —
	// see useNativeScreenRecording's `enabled` param for why this matters.
	const recorder = useNativeScreenRecording(launcherOpen);
	const previousPhaseRef = useRef(recorder.phase);

	// Close the launcher dialog automatically once the share picker resolves
	// and recording actually begins (leave it open on 'error' so the user
	// can see the message and retry).
	useEffect(() => {
		if (previousPhaseRef.current !== "recording" && recorder.phase === "recording") {
			setLauncherOpen(false);
		}
		previousPhaseRef.current = recorder.phase;
	}, [recorder.phase]);

	const confirmReplaceSourceWithUnsavedChanges = useCallback(
		async (actionLabel: string) => {
			if (!hasUnsavedChanges) return true;
			const decision = await openUnsavedChangesDialog(actionLabel);
			if (decision === "discard") return true;
			if (decision === "save") return saveProject(false);
			return false;
		},
		[hasUnsavedChanges, openUnsavedChangesDialog, saveProject],
	);

	const openLauncher = useCallback(async () => {
		if (!(await confirmReplaceSourceWithUnsavedChanges("start a new recording"))) return;
		setLauncherOpen(true);
	}, [confirmReplaceSourceWithUnsavedChanges]);

	const applyRecordingResult = useCallback(
		(result: NativeRecordingResult) => {
			const screenUrl = URL.createObjectURL(result.screenBlob);
			webBlobMap.set(screenUrl, result.screenBlob);
			if (result.cursorTelemetry.length > 0) {
				cursorTelemetryMap.set(screenUrl, result.cursorTelemetry);
			}

			try {
				videoPlaybackRef.current?.pause();
			} catch {
				// The preview may already be tearing down.
			}
			setIsPlaying(false);
			setCurrentTime(0);
			setDuration(0);
			project.setVideoSourcePath(screenUrl);
			project.setVideoPath(screenUrl);
			project.setCurrentProjectPath(null);
			project.setLastSavedSnapshot(null);
			resetSourceScopedEditorState();
			pendingFreshRecordingAutoZoomPathRef.current = appearance.autoApplyFreshRecordingAutoZooms
				? screenUrl
				: null;

			if (result.webcamBlob) {
				const webcamUrl = URL.createObjectURL(result.webcamBlob);
				webBlobMap.set(webcamUrl, result.webcamBlob);
				appearance.setWebcam((previous) => ({
					...previous,
					enabled: true,
					sourcePath: webcamUrl,
					timeOffsetMs: result.timeOffsetMs,
				}));
			} else {
				appearance.setWebcam((previous) => ({
					...previous,
					enabled: false,
					sourcePath: null,
					timeOffsetMs: DEFAULT_WEBCAM_TIME_OFFSET_MS,
				}));
			}

			applySessionPresentation(null);
			project.setError(null);
			toast.success(
				result.endedBySystem
					? "Screen sharing stopped — recording added to timeline"
					: "Recording added to timeline",
			);
		},
		[
			appearance,
			pendingFreshRecordingAutoZoomPathRef,
			project,
			resetSourceScopedEditorState,
			setCurrentTime,
			setDuration,
			setIsPlaying,
			videoPlaybackRef,
			applySessionPresentation,
		],
	);

	// Handles both the explicit Stop button and the browser's own "Stop
	// sharing" UI — both paths land here via `recorder.lastResult`, so the
	// recording is finalized onto the timeline exactly once either way.
	useEffect(() => {
		if (!recorder.lastResult) return;
		applyRecordingResult(recorder.lastResult);
		recorder.clearLastResult();
	}, [recorder.lastResult, applyRecordingResult, recorder.clearLastResult]);

	const handleStartRecording = useCallback(async () => {
		// Fire-and-forget, and before awaiting anything: Picture-in-Picture
		// requires a real user gesture, and this click is it. `recorder.start()`
		// awaits the native screen-share picker, which can take as long as the
		// user takes to choose — long enough to spend the gesture's activation
		// window before a PiP request made afterward would still count.
		if (recorder.webcamEnabled) {
			void recorder.requestWebcamPictureInPicture();
		}
		await recorder.start();
	}, [recorder]);

	const handleStopRecording = useCallback(() => {
		recorder.stop();
	}, [recorder]);

	return {
		recorder,
		launcherOpen,
		setLauncherOpen,
		openLauncher,
		handleStartRecording,
		handleStopRecording,
	};
}
