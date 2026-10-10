import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
	useCallback: (callback: unknown) => callback,
	useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("@/lib/exporter/localMediaSource", () => ({ resolveMediaElementSource: vi.fn() }));

import { useTimelineAudioActions } from "./useTimelineAudioActions";

function setup(uploadResult: Record<string, unknown>) {
	vi.stubGlobal("window", {
		electronAPI: { uploadMediaFile: vi.fn(async () => uploadResult) },
	});
	const reportError = vi.fn();
	const onAudioAdded = vi.fn();
	const { handleAddAudio } = useTimelineAudioActions({
		timeline: { videoDuration: 10, totalMs: 10_000, currentTimeMs: 0 },
		regions: { audio: [] },
		onAudioAdded,
		deps: {
			openFilePicker: async () => ({ success: true, path: "blob:http://localhost/music" }),
			probeAudioDurationMs: async () => 4_000,
			reportError,
		},
	});
	return { handleAddAudio, reportError, onAudioAdded };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("audio upload after adding audio", () => {
	it("adds the audio and reports nothing when the upload is skipped while signed out", async () => {
		const { handleAddAudio, reportError, onAudioAdded } = setup({ success: false, skipped: true });

		await handleAddAudio();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(onAudioAdded).toHaveBeenCalledOnce();
		expect(reportError).not.toHaveBeenCalled();
	});

	it("still reports a real upload failure", async () => {
		const { handleAddAudio, reportError } = setup({ success: false, message: "network down" });

		await handleAddAudio();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(reportError).toHaveBeenCalledWith("Cloud upload failed", "network down");
	});
});
