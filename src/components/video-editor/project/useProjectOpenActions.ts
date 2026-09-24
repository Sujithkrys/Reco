import {
	type Dispatch,
	type MutableRefObject,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
} from "react";
import { uploadedMediaPaths, webBlobMap } from "@/lib/webElectronAPI";
import { toast } from "sonner";
import { fromFileUrl, resolveVideoUrl, createProjectData } from "../projectPersistence";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useProjectState } from "../state/useProjectState";
import { DEFAULT_WEBCAM_TIME_OFFSET_MS } from "../types";
import type { VideoPlaybackRef } from "../VideoPlayback";

type Set<T> = Dispatch<SetStateAction<T>>;

type UseProjectOpenActionsInput = {
	project: ReturnType<typeof useProjectState>;
	appearance: ReturnType<typeof useAppearanceState>;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	pendingFreshRecordingAutoZoomPathRef: MutableRefObject<string | null>;
	hasUnsavedChanges: boolean;
	setViewMode: Set<"dashboard" | "editor">;
	setIsPlaying: Set<boolean>;
	setCurrentTime: Set<number>;
	setDuration: Set<number>;
	applyLoadedProject: (candidate: unknown, path?: string | null) => Promise<boolean>;
	openUnsavedChangesDialog: (actionLabel: string) => Promise<"save" | "discard" | "cancel">;
	saveProject: (forceSaveAs: boolean) => Promise<boolean>;
	refreshProjectLibrary: () => Promise<void>;
	resetSourceScopedEditorState: () => void;
	applySessionPresentation: (session: null) => void;
	handleSaveProject: () => Promise<unknown>;
	handleSaveProjectAs: () => Promise<unknown>;
};

export function useProjectOpenActions({
	project,
	appearance,
	videoPlaybackRef,
	pendingFreshRecordingAutoZoomPathRef,
	hasUnsavedChanges,
	setViewMode,
	setIsPlaying,
	setCurrentTime,
	setDuration,
	applyLoadedProject,
	openUnsavedChangesDialog,
	saveProject,
	refreshProjectLibrary,
	resetSourceScopedEditorState,
	applySessionPresentation,
	handleSaveProject,
	handleSaveProjectAs,
}: UseProjectOpenActionsInput) {
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

	const handleOpenProjectFromLibrary = useCallback(
		async (projectPath: string) => {
			if (!(await confirmReplaceSourceWithUnsavedChanges("open another project"))) return;
			const result = await window.electronAPI.openProjectFileAtPath(projectPath);
			if (result.canceled) return;
			if (!result.success) {
				toast.error(result.message || "Failed to load project");
				return;
			}
			if (!(await applyLoadedProject(result.project, result.path ?? null))) {
				toast.error("Invalid project file format");
				return;
			}
			project.setProjectBrowserOpen(false);
			project.setError(null);
			setViewMode("editor");
			await refreshProjectLibrary();
			toast.success(`Project loaded from ${result.path}`);
		},
		[
			applyLoadedProject,
			confirmReplaceSourceWithUnsavedChanges,
			project,
			refreshProjectLibrary,
		],
	);

	const doImportMediaOrProject = useCallback(async (opts?: {
		preserveProject?: boolean;
		skipUnsavedPrompt?: boolean;
		/** Pre-supplied file (drag-and-drop); skips the OS picker. */
		file?: File;
	}) => {
		if (!opts?.skipUnsavedPrompt && !(await confirmReplaceSourceWithUnsavedChanges("import a file"))) return;

		// Every entry point funnels through here. A dropped file just bypasses
		// the picker step; everything downstream is identical.
		let result: { canceled?: boolean; success?: boolean; message?: string; path?: string; kind?: string; project?: unknown };
		if (opts?.file) {
			if (!opts.file.type.startsWith("video/")) {
				toast.error("That file isn't a video.");
				return;
			}
			const objectUrl = URL.createObjectURL(opts.file);
			webBlobMap.set(objectUrl, opts.file);
			result = { success: true, path: objectUrl, kind: "media" };
		} else {
			result = await window.electronAPI.openVideoFilePicker({ includeProjects: true });
		}

		if (result.canceled) return;
		if (!result.success) {
			toast.error(result.message || "Failed to import file");
			return;
		}
		if (result.kind === "project" || result.project) {
			if (!(await applyLoadedProject(result.project, result.path ?? null))) {
				toast.error("Invalid project file format");
				return;
			}
			project.setProjectBrowserOpen(false);
			project.setError(null);
			setViewMode("editor");
			await refreshProjectLibrary();
			toast.success(result.path ? `Project loaded from ${result.path}` : "Project loaded");
			return;
		}
		if (!result.path) {
			toast.error("No media file selected");
			return;
		}

		const sourcePath = fromFileUrl(result.path);
		await window.electronAPI.setCurrentVideoPath(sourcePath, { preserveProjectPath: false });
		const sourceVideoUrl = await resolveVideoUrl(sourcePath);

		// Client-direct upload to Supabase Storage (TUS multipart above 100MB).
		// Runs in the background so editing can start immediately.
		if (window.electronAPI.uploadMediaFile) {
			window.electronAPI
				.uploadMediaFile(opts?.file ?? result.path)
				.then((res: { success?: boolean; path?: string; message?: string }) => {
					if (res?.success) {
						uploadedMediaPaths.set(sourcePath, res.path ?? "");
					} else {
						toast.error(`Cloud upload failed: ${res?.message ?? "unknown error"}`);
					}
				})
				.catch((err: unknown) => {
					toast.error(`Cloud upload failed: ${String(err)}`);
				});
		}
		try {
			videoPlaybackRef.current?.pause();
		} catch {
			// The preview may already be tearing down.
		}
		setIsPlaying(false);
		setCurrentTime(0);
		setDuration(0);
		project.setVideoSourcePath(sourcePath);
		project.setVideoPath(sourceVideoUrl);
		if (!opts?.preserveProject) {
			project.setCurrentProjectPath(null);
		}
		project.setLastSavedSnapshot(null);
		resetSourceScopedEditorState();
		pendingFreshRecordingAutoZoomPathRef.current = appearance.autoApplyFreshRecordingAutoZooms
			? sourceVideoUrl
			: null;
		appearance.setWebcam((previous) => ({
			...previous,
			enabled: false,
			sourcePath: null,
			timeOffsetMs: DEFAULT_WEBCAM_TIME_OFFSET_MS,
		}));
		applySessionPresentation(null);
		project.setProjectBrowserOpen(false);
		project.setError(null);
		setViewMode("editor");
		await refreshProjectLibrary();
		toast.success("Media imported");
	}, [
		confirmReplaceSourceWithUnsavedChanges,
		applyLoadedProject,
		project,
		appearance,
		setViewMode,
		videoPlaybackRef,
		setIsPlaying,
		setCurrentTime,
		setDuration,
		resetSourceScopedEditorState,
		pendingFreshRecordingAutoZoomPathRef,
		applySessionPresentation,
		refreshProjectLibrary,
	]);

	const handleImportMediaOrProject = useCallback(() => doImportMediaOrProject(), [doImportMediaOrProject]);
	
	const handleImportVideoForCurrentProject = useCallback(() => doImportMediaOrProject({ preserveProject: true, skipUnsavedPrompt: true }), [doImportMediaOrProject]);

	/** Drag-and-drop entry point — same import path, file supplied directly. */
	const handleImportDroppedFile = useCallback(
		(file: File) =>
			doImportMediaOrProject({ preserveProject: true, skipUnsavedPrompt: true, file }),
		[doImportMediaOrProject],
	);

	const handleOpenProjectBrowser = useCallback(() => {
		if (project.projectBrowserOpen) {
			project.setProjectBrowserOpen(false);
			return;
		}
		project.setProjectBrowserOpen(true);
		void refreshProjectLibrary();
	}, [project.projectBrowserOpen, project.setProjectBrowserOpen, refreshProjectLibrary]);

	useEffect(() => {
		const removeLoad = window.electronAPI.onMenuLoadProject(
			() => void handleOpenProjectBrowser(),
		);
		const removeSave = window.electronAPI.onMenuSaveProject(handleSaveProject);
		const removeSaveAs = window.electronAPI.onMenuSaveProjectAs(handleSaveProjectAs);
		return () => {
			removeLoad?.();
			removeSave?.();
			removeSaveAs?.();
		};
	}, [handleOpenProjectBrowser, handleSaveProject, handleSaveProjectAs]);

	const handleCreateNewProject = useCallback(async (postAction?: "upload" | "record") => {
		if (!(await confirmReplaceSourceWithUnsavedChanges("create a new project"))) return;

		const emptyProjectData = createProjectData("", {});
		const result = await window.electronAPI.saveProjectFile(emptyProjectData, "Untitled Project");

		if (result.canceled) return null;
		if (!result.success || !result.path) {
			toast.error(result.message || "Failed to create project");
			return null;
		}

		// Since we just created it, we can open it
		await handleOpenProjectFromLibrary(result.path);
		
		if (postAction === "upload") {
			// Trigger import, bypassing unsaved prompt and keeping the new project ID
			await doImportMediaOrProject({ preserveProject: true, skipUnsavedPrompt: true });
		} else if (postAction === "record") {
			// TODO: trigger screen capture when goal 2 is merged
			// For now, this is handled gracefully by being a no-op since startNativeScreenRecording returns success: false
			const captureRes = await window.electronAPI.startNativeScreenRecording();
			if (!captureRes.success) {
				toast.error(captureRes.message || "Screen recording is not available.");
			}
		}

		return result.path;
	}, [confirmReplaceSourceWithUnsavedChanges, handleOpenProjectFromLibrary, doImportMediaOrProject]);

	return { handleOpenProjectFromLibrary, handleImportMediaOrProject, handleOpenProjectBrowser, handleCreateNewProject, handleImportVideoForCurrentProject, handleImportDroppedFile };
}
