import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const idb = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({
	set: async (key: string, value: unknown) => {
		idb.set(key, value);
	},
	get: async (key: string) => idb.get(key),
	keys: async () => [...idb.keys()],
	del: async (key: string) => {
		idb.delete(key);
	},
}));
vi.mock("./supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: {} }) } } }));
vi.mock("tus-js-client", () => ({ Upload: class {} }));

import { webElectronAPI } from "./webElectronAPI";

// biome-ignore lint/suspicious/noExplicitAny: the web API is typed as unknown.
const api = webElectronAPI as any;
const blobsByUrl = new Map<string, Blob>();
let nextBlobUrlId = 0;

function createBlobUrl(blob: Blob) {
	const url = `blob:http://localhost:5173/${nextBlobUrlId++}`;
	blobsByUrl.set(url, blob);
	return url;
}

function mediaKeys() {
	return [...idb.keys()].filter((key) => key.startsWith("media_"));
}

beforeEach(() => {
	idb.clear();
	blobsByUrl.clear();
	vi.stubGlobal("localStorage", {
		store: new Map<string, string>(),
		getItem(key: string) {
			return this.store.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			this.store.set(key, value);
		},
		removeItem(key: string) {
			this.store.delete(key);
		},
	});
	vi.stubGlobal("fetch", async (url: string) => {
		const blob = blobsByUrl.get(url);
		return blob ? new Response(blob) : new Response(null, { status: 404 });
	});
	vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => createBlobUrl(blob as Blob));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

type StoredRecord = { id: string; name: string; thumbnail_url: string | null; editor_state: { projectId?: string } };
const record = (id: string) => idb.get(`project_${id}`) as StoredRecord;
const projectCount = () => [...idb.keys()].filter((key) => key.startsWith("project_")).length;

describe("web project naming", () => {
	it("keeps the user's project name when the project is saved again", async () => {
		await api.saveProjectFile({ version: 1, videoPath: "", editor: {} }, "Untitled Project", "p1");
		await api.renameProjectFile("p1", "Launch video");

		// Ordinary saves pass the video's file name; it must not replace the project name.
		await api.saveProjectFile({ version: 1, videoPath: "", editor: {} }, "screen-recording", "p1");

		expect(record("p1").name).toBe("Launch video");
	});

	it("names a brand-new project after the given file name", async () => {
		const result = await api.saveProjectFile({ version: 1, videoPath: "", editor: {} }, "screen-recording");

		expect(record(result.path).name).toBe("screen-recording");
	});

	it("stores the project id inside the saved project data", async () => {
		const result = await api.saveProjectFile({ version: 1, videoPath: "", editor: {} }, "Demo");

		expect(result.projectId).toBe(result.path);
		expect(record(result.path).editor_state.projectId).toBe(result.path);
	});

	it("renames the open project in place instead of creating a copy", async () => {
		await api.saveProjectFile({ version: 1, videoPath: "", editor: {} }, "Untitled Project", "p2");

		const result = await api.saveProjectFileNamed(
			{ version: 1, videoPath: "", editor: {} },
			"  Final cut  ",
			null,
			"rename",
			"p2",
		);

		expect(result).toMatchObject({ success: true, path: "p2", projectId: "p2" });
		expect(record("p2").name).toBe("Final cut");
		expect(projectCount()).toBe(1);
	});

	it("renames using the project id stored in the data when no path is given", async () => {
		await api.saveProjectFile({ version: 1, videoPath: "", editor: {} }, "Untitled Project", "p3");

		await api.saveProjectFileNamed(
			{ version: 1, projectId: "p3", videoPath: "", editor: {} },
			"Renamed",
			null,
			"rename",
		);

		expect(record("p3").name).toBe("Renamed");
		expect(projectCount()).toBe(1);
	});

	it("save-as copy creates a separate project", async () => {
		await api.saveProjectFile({ version: 1, videoPath: "", editor: {} }, "Original", "p4");

		const result = await api.saveProjectFileNamed(
			{ version: 1, projectId: "p4", videoPath: "", editor: {} },
			"Copy",
			null,
			"copy",
		);

		expect(result.path).not.toBe("p4");
		expect(record("p4").name).toBe("Original");
		expect(record(result.path).name).toBe("Copy");
	});

	it("keeps the thumbnail when a save has none and returns it from getProjectThumbnail", async () => {
		await api.saveProjectFile({ version: 1, videoPath: "", editor: {} }, "Demo", "p5", "data:image/png;base64,AAA");
		await api.saveProjectFile({ version: 1, videoPath: "", editor: {} }, "Demo", "p5");

		await expect(api.getProjectThumbnail("p5")).resolves.toEqual({
			success: true,
			data: "data:image/png;base64,AAA",
		});
	});
});

describe("web project media persistence", () => {
	it("stores a blob once across repeated saves of the same project", async () => {
		const videoUrl = createBlobUrl(new Blob([new Uint8Array(16)], { type: "video/mp4" }));
		const project = { version: 1, videoPath: videoUrl, editor: {} };

		await api.saveProjectFile(project, "Demo", "project-1");
		await api.saveProjectFile(project, "Demo", "project-1");
		await api.saveProjectFile(project, "Demo", "project-1");

		expect(mediaKeys()).toHaveLength(1);
		const stored = idb.get("project_project-1") as { editor_state: { videoPath: string } };
		expect(stored.editor_state.videoPath).toBe(`idb://${mediaKeys()[0]}`);
	});

	it("stores nothing new when a reopened project is saved again", async () => {
		const videoUrl = createBlobUrl(new Blob([new Uint8Array(16)], { type: "video/mp4" }));
		await api.saveProjectFile({ version: 1, videoPath: videoUrl, editor: {} }, "Demo", "project-2");
		expect(mediaKeys()).toHaveLength(1);

		const reopened = await api.openProjectFileAtPath("project-2");
		expect(reopened.success).toBe(true);
		expect(reopened.project.videoPath).toMatch(/^blob:/);
		expect(reopened.project.videoPath).not.toBe(videoUrl);

		await api.saveProjectFile(reopened.project, "Demo", "project-2");
		await api.saveProjectFile(reopened.project, "Demo", "project-2");

		expect(mediaKeys()).toHaveLength(1);
	});

	it("fails the save with a storage error when a media write fails", async () => {
		const idbKeyval = await import("idb-keyval");
		const setSpy = vi
			.spyOn(idbKeyval, "set")
			.mockRejectedValueOnce(new DOMException("Quota exceeded", "QuotaExceededError"));
		const videoUrl = createBlobUrl(new Blob([new Uint8Array(16)], { type: "video/mp4" }));

		const result = await api.saveProjectFile(
			{ version: 1, videoPath: videoUrl, editor: {} },
			"Demo",
			"project-4",
		);

		expect(setSpy).toHaveBeenCalled();
		expect(result).toMatchObject({ success: false, storageError: true });
		expect(idb.has("project_project-4")).toBe(false);
	});

	it("skips the cloud upload without an error when signed out", async () => {
		const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });

		await expect(api.uploadMediaFile(file)).resolves.toMatchObject({
			success: false,
			skipped: true,
		});
	});

	it("still stores each distinct file once", async () => {
		const videoUrl = createBlobUrl(new Blob([new Uint8Array(16)], { type: "video/mp4" }));
		const audioUrl = createBlobUrl(new Blob([new Uint8Array(8)], { type: "audio/mpeg" }));
		const project = {
			version: 1,
			videoPath: videoUrl,
			editor: { audioRegions: [{ id: "audio-1", audioPath: audioUrl }] },
		};

		await api.saveProjectFile(project, "Demo", "project-3");
		await api.saveProjectFile(project, "Demo", "project-3");

		expect(mediaKeys()).toHaveLength(2);
	});
});
