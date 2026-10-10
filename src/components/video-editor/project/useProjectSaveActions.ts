import { type RefObject, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createProjectData, type EditorProjectData } from "../projectPersistence";
import type { useProjectState } from "../state/useProjectState";
import { cloneStructured, getErrorMessage } from "../videoEditorUtils";
import { useAuth } from "@/lib/auth";

const PROJECT_AUTOSAVE_DELAY_MS = 1_000;
export const PROJECT_STORAGE_FAILURE_MESSAGE =
	"Couldn't save to this browser's storage (it may be full). Autosave is paused; use Save to try again.";

// Page-session state: once a silent save hits a storage failure, autosave stops
// retrying until a manual save succeeds, and the warning is shown only once.
let autosavePausedForStorage = false;
let storageFailureWarningShown = false;

export function resetProjectStorageFailureStateForTests() {
	autosavePausedForStorage = false;
	storageFailureWarningShown = false;
}

type SaveProjectOptions = {
	silent?: boolean;
	remountPreviewAfterSave?: boolean;
	refreshLibraryAfterSave?: boolean;
	captureThumbnail?: boolean;
};

type UseProjectSaveActionsInput = {
	project: ReturnType<typeof useProjectState>;
	currentSourcePath: string | null;
	currentProjectSnapshot: EditorProjectData | null;
	currentPersistedEditorState: Parameters<typeof createProjectData>[1];
	projectDisplayName: string;
	hasUnsavedChanges: boolean;
	projectSaveDialogInputRef: RefObject<HTMLInputElement | null>;
	projectNameInputRef: RefObject<HTMLInputElement | null>;
	openProjectSaveDialog: (initialName: string) => Promise<boolean>;
	resolveProjectSaveDialog: (saved: boolean) => void;
	captureProjectThumbnail: () => Promise<string | null>;
	refreshProjectLibrary: () => Promise<void>;
	remountPreview: () => void;
};

export function useProjectSaveActions({
	project,
	currentSourcePath,
	currentProjectSnapshot,
	currentPersistedEditorState,
	projectDisplayName,
	hasUnsavedChanges,
	projectSaveDialogInputRef,
	projectNameInputRef,
	openProjectSaveDialog,
	resolveProjectSaveDialog,
	captureProjectThumbnail,
	refreshProjectLibrary,
	remountPreview,
}: UseProjectSaveActionsInput) {
	const {
		currentProjectPath,
		lastSavedSnapshot,
		projectSaveDialogDraft,
		projectNameDraft,
		setCurrentProjectPath,
		setLastSavedSnapshot,
		setIsSavingProjectDialog,
		setProjectNameDraft,
		setIsEditingProjectName,
		setIsSavingProjectName,
		setProjectBrowserOpen,
	} = project;
	const { requireAuth } = useAuth();
	const autosaveTimeoutRef = useRef<number | null>(null);
	const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
	const clearPendingAutosave = useCallback(() => {
		if (autosaveTimeoutRef.current !== null) {
			window.clearTimeout(autosaveTimeoutRef.current);
			autosaveTimeoutRef.current = null;
		}
	}, []);
	const queueSave = useCallback((task: () => Promise<boolean>) => {
		const run = saveQueueRef.current.catch(() => undefined).then(task);
		saveQueueRef.current = run.catch(() => undefined);
		return run;
	}, []);

	const saveProject = useCallback(
		async (forceSaveAs: boolean, options?: SaveProjectOptions) => {
			return new Promise<boolean>((resolve) => {
				const run = () => {
					clearPendingAutosave();
					queueSave(async () => {
						if (!currentSourcePath) {
							if (!options?.silent) toast.error("No video loaded");
							resolve(false);
							return false;
						}

						const captureThumbnail = options?.captureThumbnail ?? true;
						const refreshLibrary = options?.refreshLibraryAfterSave ?? true;
						const remount = options?.remountPreviewAfterSave ?? true;
						try {
							const projectData =
								currentProjectSnapshot?.videoPath === currentSourcePath
									? currentProjectSnapshot
									: createProjectData(
											currentSourcePath,
											currentPersistedEditorState,
											lastSavedSnapshot?.projectId ?? null,
										);
							const fileNameBase =
								(currentSourcePath || "")
									.split(/[\\/]/)
									.pop()
									?.replace(/\.[^.]+$/, "") || `project-${Date.now()}`;
							let targetPath = forceSaveAs ? undefined : (currentProjectPath ?? undefined);

							if (!forceSaveAs && !targetPath) {
								const activeProject = await window.electronAPI.loadCurrentProjectFile();
								if (activeProject.success && activeProject.path) {
									targetPath = activeProject.path;
									setCurrentProjectPath(activeProject.path);
								}
							}
							if (forceSaveAs || !targetPath) {
								if (options?.silent) {
									resolve(false);
									return false;
								}
								const didSave = await openProjectSaveDialog(projectDisplayName || fileNameBase);
								resolve(didSave);
								return didSave;
							}

							const thumbnail = captureThumbnail
								? await captureProjectThumbnail()
								: undefined;
							const result = await window.electronAPI.saveProjectFile(
								projectData,
								fileNameBase,
								targetPath,
								thumbnail,
							);
							if (result.canceled) {
								if (!options?.silent) toast.info("Project save canceled");
								resolve(false);
								return false;
							}
							if (!result.success) {
								if (!options?.silent) {
									toast.error(result.message || "Failed to save project");
								} else if (result.storageError) {
									autosavePausedForStorage = true;
									if (!storageFailureWarningShown) {
										storageFailureWarningShown = true;
										toast.warning(PROJECT_STORAGE_FAILURE_MESSAGE);
									}
								}
								resolve(false);
								return false;
							}

							if (!options?.silent) autosavePausedForStorage = false;
							if (result.path) setCurrentProjectPath(result.path);
							setLastSavedSnapshot(
								cloneStructured(
									createProjectData(
										projectData.videoPath,
										projectData.editor,
										result.projectId ?? projectData.projectId ?? null,
									),
								),
							);
							if (refreshLibrary) await refreshProjectLibrary();
							if (!options?.silent) toast.success(`Project saved to ${result.path}`);
							resolve(true);
							return true;
						} catch (err) {
							console.error("Save project error:", err);
							resolve(false);
							return false;
						} finally {
							if (remount) remountPreview();
						}
					});
				};
				// Silent saves (autosave, leaving the editor) only write to this
				// browser's storage, so they never ask the user to sign in.
				if (options?.silent) run();
				else requireAuth(run);
			});
		},
		[
			clearPendingAutosave,
			queueSave,
			currentSourcePath,
			currentProjectSnapshot,
			currentPersistedEditorState,
			lastSavedSnapshot?.projectId,
			currentProjectPath,
			setCurrentProjectPath,
			openProjectSaveDialog,
			projectDisplayName,
			captureProjectThumbnail,
			setLastSavedSnapshot,
			refreshProjectLibrary,
			remountPreview,
			requireAuth,
		],
	);

	useEffect(() => {
		window.electronAPI.setHasUnsavedChanges(hasUnsavedChanges);
	}, [hasUnsavedChanges]);
	useEffect(
		() => window.electronAPI.onRequestSaveBeforeClose(() => saveProject(false)),
		[saveProject],
	);
	useEffect(() => {
		if (!currentProjectPath || !hasUnsavedChanges || autosavePausedForStorage) {
			clearPendingAutosave();
			return;
		}
		autosaveTimeoutRef.current = window.setTimeout(() => {
			autosaveTimeoutRef.current = null;
			if (autosavePausedForStorage) return;
			void saveProject(false, {
				silent: true,
				remountPreviewAfterSave: false,
				refreshLibraryAfterSave: false,
				captureThumbnail: false,
			});
		}, PROJECT_AUTOSAVE_DELAY_MS);
		return clearPendingAutosave;
	}, [clearPendingAutosave, currentProjectPath, hasUnsavedChanges, saveProject]);
	useEffect(() => clearPendingAutosave, [clearPendingAutosave]);

	const saveProjectWithName = useCallback(
		async (name: string, mode: "rename" | "copy" = "rename") => {
			const trimmedName = name.trim();
			if (!trimmedName) {
				toast.error("Project name is required");
				return false;
			}
			if (!currentSourcePath) {
				toast.error("No video loaded");
				return false;
			}
			try {
				const projectData =
					currentProjectSnapshot?.videoPath === currentSourcePath
						? currentProjectSnapshot
						: createProjectData(
								currentSourcePath,
								currentPersistedEditorState,
								lastSavedSnapshot?.projectId ?? null,
							);
				const result = await window.electronAPI.saveProjectFileNamed(
					projectData,
					trimmedName,
					await captureProjectThumbnail(),
					mode,
					// Rename must overwrite the open project rather than create a copy.
					mode === "rename" ? currentProjectPath : null,
				);
				if (result.canceled) {
					toast.info("Project save canceled");
					return false;
				}
				if (!result.success) {
					toast.error(result.message || "Failed to save project");
					return false;
				}
				if (result.path) setCurrentProjectPath(result.path);
				setLastSavedSnapshot(
					cloneStructured(
						createProjectData(
							projectData.videoPath,
							projectData.editor,
							result.projectId ?? projectData.projectId ?? null,
						),
					),
				);
				await refreshProjectLibrary();
				toast.success(result.path ? `Project saved to ${result.path}` : "Project saved");
				return true;
			} finally {
				remountPreview();
			}
		},
		[
			currentSourcePath,
			currentProjectSnapshot,
			currentPersistedEditorState,
			currentProjectPath,
			lastSavedSnapshot,
			setCurrentProjectPath,
			setLastSavedSnapshot,
			captureProjectThumbnail,
			refreshProjectLibrary,
			remountPreview,
		],
	);

	const handleProjectSaveDialogSubmit = useCallback(
		async (event?: React.FormEvent<HTMLFormElement>) => {
			event?.preventDefault();
			const name = projectSaveDialogDraft.trim();
			if (!name) {
				toast.error("Project name is required");
				projectSaveDialogInputRef.current?.focus();
				return;
			}
			setIsSavingProjectDialog(true);
			let saved = false;
			try {
				saved = await saveProjectWithName(name, "copy");
			} catch (error) {
				toast.error(getErrorMessage(error));
			} finally {
				setIsSavingProjectDialog(false);
			}
			if (saved) resolveProjectSaveDialog(true);
			else {
				projectSaveDialogInputRef.current?.focus();
				projectSaveDialogInputRef.current?.select();
			}
		},
		[
			projectSaveDialogDraft,
			setIsSavingProjectDialog,
			projectSaveDialogInputRef,
			resolveProjectSaveDialog,
			saveProjectWithName,
		],
	);

	const closeProjectNameEditor = useCallback(() => {
		setProjectNameDraft(projectDisplayName);
		setIsEditingProjectName(false);
	}, [setProjectNameDraft, setIsEditingProjectName, projectDisplayName]);
	const handleProjectNameSubmit = useCallback(
		async (event?: React.FormEvent<HTMLFormElement>) => {
			event?.preventDefault();
			const name = projectNameDraft.trim();
			if (!name) return closeProjectNameEditor();
			setIsSavingProjectName(true);
			let saved = false;
			try {
				saved = await saveProjectWithName(name, "rename");
			} catch (error) {
				toast.error(getErrorMessage(error));
			} finally {
				setIsSavingProjectName(false);
			}
			if (saved) setIsEditingProjectName(false);
			else {
				projectNameInputRef.current?.focus();
				projectNameInputRef.current?.select();
			}
		},
		[
			projectNameDraft,
			setIsSavingProjectName,
			setIsEditingProjectName,
			projectNameInputRef,
			closeProjectNameEditor,
			saveProjectWithName,
		],
	);
	const handleSaveProject = useCallback(() => saveProject(false), [saveProject]);
	const handleSaveProjectAs = useCallback(async () => {
		if (await saveProject(true)) setProjectBrowserOpen(false);
	}, [saveProject, setProjectBrowserOpen]);

	return {
		saveProject,
		handleSaveProject,
		handleSaveProjectAs,
		handleProjectSaveDialogSubmit,
		closeProjectNameEditor,
		handleProjectNameSubmit,
	};
}
