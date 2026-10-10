import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
	effects: [] as (() => void | (() => void))[],
	requireAuth: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("react", () => ({
	useCallback: (callback: unknown) => callback,
	useEffect: (effect: () => void) => harness.effects.push(effect),
	useRef: (value: unknown) => ({ current: value }),
}));
vi.mock("sonner", () => ({ toast: harness.toast }));
// Signed out: requireAuth only opens the sign-in dialog and never runs the action.
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ requireAuth: harness.requireAuth }) }));

import {
	PROJECT_STORAGE_FAILURE_MESSAGE,
	resetProjectStorageFailureStateForTests,
	useProjectSaveActions,
} from "./useProjectSaveActions";

function setup(
	saveResult: Record<string, unknown> = { success: true, path: "project-1" },
	projectNameDraft = "",
) {
	const saveProjectFile = vi.fn(async () => saveResult);
	const saveProjectFileNamed = vi.fn(async () => ({ success: true, path: "project-1" }));
	const setTimeoutSpy = vi.fn(() => 1);
	vi.stubGlobal("window", {
		electronAPI: {
			saveProjectFile,
			saveProjectFileNamed,
			setHasUnsavedChanges: vi.fn(),
			onRequestSaveBeforeClose: vi.fn(() => () => undefined),
			loadCurrentProjectFile: vi.fn(async () => ({ success: false })),
		},
		setTimeout: setTimeoutSpy,
		clearTimeout: vi.fn(),
	});
	const actions = useProjectSaveActions({
		project: {
			currentProjectPath: "project-1",
			lastSavedSnapshot: null,
			projectSaveDialogDraft: "",
			projectNameDraft,
			setCurrentProjectPath: vi.fn(),
			setLastSavedSnapshot: vi.fn(),
			setIsSavingProjectDialog: vi.fn(),
			setProjectNameDraft: vi.fn(),
			setIsEditingProjectName: vi.fn(),
			setIsSavingProjectName: vi.fn(),
			setProjectBrowserOpen: vi.fn(),
		} as never,
		currentSourcePath: "blob:http://localhost/video",
		currentProjectSnapshot: null,
		currentPersistedEditorState: {} as never,
		projectDisplayName: "My project",
		hasUnsavedChanges: true,
		projectSaveDialogInputRef: { current: null },
		projectNameInputRef: { current: null },
		openProjectSaveDialog: vi.fn(async () => false),
		resolveProjectSaveDialog: vi.fn(),
		captureProjectThumbnail: vi.fn(async () => null),
		refreshProjectLibrary: vi.fn(async () => undefined),
		remountPreview: vi.fn(),
	});
	return { actions, saveProjectFile, saveProjectFileNamed, setTimeoutSpy };
}

const SILENT = {
	silent: true,
	remountPreviewAfterSave: false,
	refreshLibraryAfterSave: false,
	captureThumbnail: false,
};

beforeEach(() => {
	resetProjectStorageFailureStateForTests();
});

afterEach(() => {
	vi.unstubAllGlobals();
	harness.effects = [];
	harness.requireAuth.mockReset();
	for (const fn of Object.values(harness.toast)) fn.mockReset();
});

describe("project save auth gating", () => {
	it("autosave writes to browser storage without asking a signed-out user to sign in", async () => {
		const { actions, saveProjectFile } = setup();

		await expect(actions.saveProject(false, SILENT)).resolves.toBe(true);

		expect(harness.requireAuth).not.toHaveBeenCalled();
		expect(saveProjectFile).toHaveBeenCalledOnce();
	});

	it("manual save asks for sign-in and does not write while signed out", () => {
		const { actions, saveProjectFile } = setup();

		void actions.saveProject(false);

		expect(harness.requireAuth).toHaveBeenCalledOnce();
		expect(saveProjectFile).not.toHaveBeenCalled();
	});
});

describe("project rename", () => {
	it("renames the open project in place", async () => {
		const { actions, saveProjectFileNamed } = setup(undefined, "Launch video");

		await actions.handleProjectNameSubmit();

		expect(saveProjectFileNamed).toHaveBeenCalledWith(
			expect.anything(),
			"Launch video",
			null,
			"rename",
			"project-1",
		);
	});
});

describe("project storage failures", () => {
	it("shows one warning per session and pauses autosave after a storage failure", async () => {
		const { actions } = setup({ success: false, storageError: true, message: "QuotaExceededError" });

		await actions.saveProject(false, SILENT);
		await actions.saveProject(false, SILENT);

		expect(harness.toast.warning).toHaveBeenCalledOnce();
		expect(harness.toast.warning).toHaveBeenCalledWith(PROJECT_STORAGE_FAILURE_MESSAGE);
		expect(harness.toast.error).not.toHaveBeenCalled();
		expect(harness.requireAuth).not.toHaveBeenCalled();

		// A fresh render with unsaved changes must not schedule another autosave.
		harness.effects = [];
		const { setTimeoutSpy } = setup();
		for (const effect of harness.effects) effect();
		expect(setTimeoutSpy).not.toHaveBeenCalled();
	});

	it("schedules autosave normally when storage is fine", () => {
		const { setTimeoutSpy } = setup();
		for (const effect of harness.effects) effect();
		expect(setTimeoutSpy).toHaveBeenCalledOnce();
	});
});
