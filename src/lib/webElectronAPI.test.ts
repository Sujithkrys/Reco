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
