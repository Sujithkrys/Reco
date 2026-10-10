import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
	requireAuth: vi.fn(),
}));
vi.mock("react", () => ({
	useCallback: (callback: unknown) => callback,
	useEffect: () => undefined,
	useRef: (value: unknown) => ({ current: value }),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ requireAuth: harness.requireAuth }) }));
vi.mock("../projectPersistence", () => ({ resolveVideoUrl: async (path: string) => path }));

import { DEFAULT_AUTO_CAPTION_SETTINGS } from "../types";
import { useAutoCaptionController } from "./useAutoCaptionController";

function setup() {
	const generateAutoCaptions = vi.fn(async () => ({ success: true, cues: [] }));
	vi.stubGlobal("window", { electronAPI: { isWebMode: true, generateAutoCaptions } });
	const setIsGeneratingCaptions = vi.fn();
	const controller = useAutoCaptionController({
		t: ((_key: string, fallback?: string) => fallback ?? "") as never,
		videoPath: "blob:http://localhost/video",
		setVideoPath: vi.fn(),
		videoSourcePath: "blob:http://localhost/video",
		setVideoSourcePath: vi.fn(),
		webcamSourcePath: null,
		whisperExecutablePath: null,
		setWhisperExecutablePath: vi.fn(),
		whisperModelPath: null,
		setWhisperModelPath: vi.fn(),
		downloadedWhisperModelPath: null,
		setDownloadedWhisperModelPath: vi.fn(),
		whisperModelDownloadStatus: "idle" as never,
		setWhisperModelDownloadStatus: vi.fn(),
		setWhisperModelDownloadProgress: vi.fn(),
		isGeneratingCaptions: false,
		setIsGeneratingCaptions,
		autoCaptionSettings: DEFAULT_AUTO_CAPTION_SETTINGS,
		setAutoCaptionSettings: vi.fn(),
		autoCaptions: [],
		setAutoCaptions: vi.fn(),
		syncActiveVideoSource: vi.fn(async () => undefined),
	});
	return { controller, generateAutoCaptions, setIsGeneratingCaptions };
}

afterEach(() => {
	vi.unstubAllGlobals();
	harness.requireAuth.mockReset();
});

describe("caption generation auth gating", () => {
	it("asks a signed-out user to sign in before doing any caption work", () => {
		const { controller, generateAutoCaptions, setIsGeneratingCaptions } = setup();

		controller.handleGenerateAutoCaptions();

		expect(harness.requireAuth).toHaveBeenCalledOnce();
		expect(setIsGeneratingCaptions).not.toHaveBeenCalled();
		expect(generateAutoCaptions).not.toHaveBeenCalled();
	});

	it("generates captions once the user is signed in", async () => {
		harness.requireAuth.mockImplementation((action: () => void) => action());
		const { controller, generateAutoCaptions, setIsGeneratingCaptions } = setup();

		controller.handleGenerateAutoCaptions();
		await vi.waitFor(() => expect(generateAutoCaptions).toHaveBeenCalledOnce());

		expect(setIsGeneratingCaptions).toHaveBeenCalledWith(true);
	});
});
