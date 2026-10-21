import { beforeEach, describe, expect, it, vi } from "vitest";

import { webBlobMap } from "@/lib/webElectronAPI";
import {
	createFallbackDemuxerSource,
	resolveMediaElementSource,
	toNamedMediaFile,
} from "./localMediaSource";

const readLocalFile = vi.fn();
const getLocalMediaUrl = vi.fn(async (filePath: string) => ({
	success: true,
	url: `http://127.0.0.1:4321/video?path=${encodeURIComponent(filePath)}`,
}));

describe("resolveMediaElementSource", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		readLocalFile.mockReset();
		getLocalMediaUrl.mockReset();
		getLocalMediaUrl.mockImplementation(async (filePath: string) => ({
			success: true,
			url: `http://127.0.0.1:4321/video?path=${encodeURIComponent(filePath)}`,
		}));
		Object.assign(globalThis, {
			window: {
				electronAPI: {
					readLocalFile,
					getLocalMediaUrl,
				},
			},
		});
	});

	it("resolves file URLs through the local media server for media elements", async () => {
		const result = await resolveMediaElementSource("file:///tmp/example.mp4");

		expect(readLocalFile).not.toHaveBeenCalled();
		expect(getLocalMediaUrl).toHaveBeenCalledWith("/tmp/example.mp4");
		expect(result.src).toBe("http://127.0.0.1:4321/video?path=%2Ftmp%2Fexample.mp4");
	});

	it("resolves absolute local paths through the local media server without copying them into blobs", async () => {
		const result = await resolveMediaElementSource("/tmp/example.wav");

		expect(readLocalFile).not.toHaveBeenCalled();
		expect(getLocalMediaUrl).toHaveBeenCalledWith("/tmp/example.wav");
		expect(result.src).toBe("http://127.0.0.1:4321/video?path=%2Ftmp%2Fexample.wav");
	});

	it("preserves loopback media-server URLs instead of materializing them through IPC", async () => {
		const result = await resolveMediaElementSource(
			"http://127.0.0.1:43123/video?path=%2Ftmp%2Fexample%20clip.mp4",
		);

		expect(readLocalFile).not.toHaveBeenCalled();
		expect(getLocalMediaUrl).not.toHaveBeenCalled();
		expect(result.src).toBe("http://127.0.0.1:43123/video?path=%2Ftmp%2Fexample%20clip.mp4");
	});

	it("leaves remote URLs untouched", async () => {
		const result = await resolveMediaElementSource("https://example.com/video.mp4");

		expect(result.src).toBe("https://example.com/video.mp4");
		expect(readLocalFile).not.toHaveBeenCalled();
	});

	it("keeps local demuxer fallback on the range-streamed media URL", async () => {
		const source = await createFallbackDemuxerSource("/tmp/large-recording.mp4");

		expect(source).toBe("http://127.0.0.1:4321/video?path=%2Ftmp%2Flarge-recording.mp4");
		expect(readLocalFile).not.toHaveBeenCalled();
	});

	it("retains the readable File fallback for remote media", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }),
		}));
		vi.stubGlobal("fetch", fetchMock);

		try {
			const source = await createFallbackDemuxerSource("https://example.com/video.mp4");

			expect(source).toBeInstanceOf(File);
			expect(fetchMock).toHaveBeenCalledWith("https://example.com/video.mp4");
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("createFallbackDemuxerSource for web blobs", () => {
	it("gives a recorded or restored Blob (no name) to the demuxer as a named File", async () => {
		// WebDemuxer splits the mounted file's name: an unnamed Blob made every web export fail
		// with "Cannot read properties of undefined (reading 'split')".
		const recording = new Blob([new Uint8Array([1, 2, 3])], { type: "video/webm;codecs=vp8,opus" });
		expect((recording as Partial<File>).name).toBeUndefined();
		webBlobMap.set("blob:http://localhost/recording", recording);

		try {
			const source = await createFallbackDemuxerSource("blob:http://localhost/recording");

			expect(source).toBeInstanceOf(File);
			const file = source as File;
			expect(file.name).toBe("media.webm");
			expect(file.name.split("/")).toEqual(["media.webm"]);
			expect(file.type).toBe("video/webm;codecs=vp8,opus");
			expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
		} finally {
			webBlobMap.delete("blob:http://localhost/recording");
		}
	});

	it("passes an imported File through unchanged", async () => {
		const imported = new File([new Uint8Array([4])], "clip.mp4", { type: "video/mp4" });
		webBlobMap.set("blob:http://localhost/imported", imported);

		try {
			expect(await createFallbackDemuxerSource("blob:http://localhost/imported")).toBe(imported);
		} finally {
			webBlobMap.delete("blob:http://localhost/imported");
		}
	});

	it("names a Blob of unknown type without an extension", () => {
		expect(toNamedMediaFile(new Blob([new Uint8Array([1])])).name).toBe("media");
	});
});
