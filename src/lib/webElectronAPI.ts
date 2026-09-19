/**
 * Web Compatibility Layer for Reco
 *
 * This module provides browser-native implementations of the Electron IPC API
 * so the editor can run as a standard web application. It maps each
 * `window.electronAPI.*` call to an equivalent browser API (localStorage,
 * File System Access API, IndexedDB, Web MediaRecorder, etc.).
 */

import { supabase } from "./supabase";
import { set, get } from "idb-keyval";

export const webBlobMap = new Map<string, Blob | File>();
export const opfsStreams = new Map<string, FileSystemWritableFileStream>();

async function persistProjectMedia(projectData: any): Promise<any> {
	let jsonString = JSON.stringify(projectData);
	const blobRegex = /"blob:(https?:\/\/[^"]+)"/g;
	const blobUrls = new Set<string>();
	let match;
	while ((match = blobRegex.exec(jsonString)) !== null) {
		blobUrls.add(`blob:${match[1]}`);
	}

	for (const blobUrl of blobUrls) {
		try {
			const response = await fetch(blobUrl);
			if (!response.ok) continue;
			const blob = await response.blob();
			const idbKey = `media_${crypto.randomUUID()}`;
			await set(idbKey, blob);
			jsonString = jsonString.split(blobUrl).join(`idb://${idbKey}`);
		} catch (err) {
			console.error(`Failed to persist blob ${blobUrl}:`, err);
		}
	}
	return JSON.parse(jsonString);
}

async function restoreProjectMedia(projectData: any): Promise<any> {
	let jsonString = JSON.stringify(projectData);
	const idbRegex = /"idb:\/\/(media_[a-zA-Z0-9-]+)"/g;
	const idbKeys = new Set<string>();
	let match;
	while ((match = idbRegex.exec(jsonString)) !== null) {
		idbKeys.add(match[1]);
	}

	for (const idbKey of idbKeys) {
		try {
			const blob = await get(idbKey);
			if (blob) {
				const freshBlobUrl = URL.createObjectURL(blob as Blob);
				webBlobMap.set(freshBlobUrl, blob as Blob);
				jsonString = jsonString.split(`idb://${idbKey}`).join(freshBlobUrl);
			} else {
				console.warn(`Media ${idbKey} not found in IndexedDB.`);
			}
		} catch (err) {
			console.error(`Failed to restore blob ${idbKey}:`, err);
		}
	}
	return JSON.parse(jsonString);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEB_SETTINGS_KEY = "reco-web-settings";

function readSettings(): Record<string, unknown> {
	try {
		return JSON.parse(localStorage.getItem(WEB_SETTINGS_KEY) || "{}");
	} catch {
		return {};
	}
}

function writeSettings(settings: Record<string, unknown>) {
	localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(settings));
}

// Simple in-memory store for current video path / session
let currentVideoPath: string | null = null;
let currentRecordingSession: {
	videoPath?: string;
	webcamPath?: string;
	timeOffsetMs?: number;
} | null = null;


// ---------------------------------------------------------------------------
// electronAPI implementation
// ---------------------------------------------------------------------------

export const webElectronAPI: any = {
	isWebMode: true,
	// ── App info ──────────────────────────────────────────────────────────
	getAppVersion: async () => "1.4.0-web",
	getPlatform: async () => "web",
	getExportHardwareInfo: async () => ({ success: true, hardware: null }),

	// ── Settings (backed by localStorage) ────────────────────────────────
	getAppSetting: (key: string) => {
		const settings = readSettings();
		return settings[key] ?? null;
	},
	setAppSetting: (key: string, value: unknown) => {
		const settings = readSettings();
		settings[key] = value;
		writeSettings(settings);
	},

	// ── Asset paths ──────────────────────────────────────────────────────
	getAssetBasePath: async () => window.location.origin + "/",
	listAssetDirectory: async (_dir: string) => ({
		success: false,
		files: [],
	}),
	readLocalFile: async (_path: string) => ({ success: false, data: null }),
	getLocalMediaUrl: async (path: string) => {
		// blob: and http(s) URLs can be used directly
		if (/^(blob:|https?:|data:)/i.test(path)) {
			return { success: true, url: path };
		}
		return { success: false, url: null };
	},
	generateWallpaperThumbnail: async (_path: string) => ({
		success: false,
		data: null,
	}),

	// ── Video / recording session ────────────────────────────────────────
	getCurrentVideoPath: async () => ({
		success: Boolean(currentVideoPath),
		path: currentVideoPath,
	}),
	setCurrentVideoPath: async (
		path: string,
		_opts?: { preserveProjectPath?: boolean }
	) => {
		currentVideoPath = path;
		return { success: true };
	},
	getCurrentRecordingSession: async () => ({
		success: Boolean(currentRecordingSession),
		session: currentRecordingSession,
	}),
	setCurrentRecordingSession: async (session: typeof currentRecordingSession) => {
		currentRecordingSession = session;
		return { success: true };
	},

	// ── Project persistence ──────────────────────────────────────────────
	loadCurrentProjectFile: async () => ({
		success: false,
		project: null,
		path: null,
	}),
	openProjectFileAtPath: async (_path: string) => {
		try {
			const { data: projectRecord, error } = await supabase
				.from("projects")
				.select("editor_state")
				.eq("id", _path)
				.single();
			if (error || !projectRecord) throw new Error("Project not found");
			
			const restoredData = await restoreProjectMedia(projectRecord.editor_state);
			
			return { success: true, project: restoredData, path: _path };
		} catch (e: any) {
			return { success: false, message: e.message, path: null };
		}
	},
	saveProjectFile: async (
		projectData: any,
		fileNameBase?: string,
		targetPath?: string,
		thumbnail?: string
	) => {
		try {
			const projectId = targetPath || crypto.randomUUID();
			
			// Persist all ephemeral blob URLs to IndexedDB
			const persistedData = await persistProjectMedia(projectData);
			
			const { error } = await supabase.from("projects").upsert({
				id: projectId,
				name: fileNameBase || "Untitled Project",
				editor_state: persistedData,
				thumbnail_url: thumbnail || null,
				updated_at: new Date().toISOString()
			});

			if (error) throw error;
			
			return { success: true, path: projectId };
		} catch (e: any) {
			console.error(e);
			return { success: false, path: null, message: e.message };
		}
	},
	getProjectLibrary: async () => {
		try {
			const { data: projects, error } = await supabase
				.from("projects")
				.select("id, name, updated_at, thumbnail_url")
				.order("updated_at", { ascending: false });
				
			if (error) throw error;
			
			const library = projects.map(p => ({
				path: p.id,
				name: p.name,
				updatedAt: new Date(p.updated_at).getTime(),
				thumbnailPath: p.thumbnail_url,
				isCurrent: false,
				isInProjectsDirectory: true
			}));
			return { success: true, library };
		} catch (e: any) {
			console.error(e);
			return { success: true, library: [] };
		}
	},
	deleteProjectFile: async (_path: string) => {
		try {
			await supabase.from("projects").delete().eq("id", _path);
			return { success: true };
		} catch {
			return { success: false };
		}
	},
	getProjectThumbnail: async (_path: string) => ({
		success: false,
		data: null,
	}),

	// ── File pickers (browser native) ────────────────────────────────────
	openVideoFilePicker: async (_opts?: { includeProjects?: boolean }) => {
		return new Promise((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = "video/*,.mp4,.webm,.mov,.mkv,.avi";
			input.onchange = (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) {
					resolve({ canceled: true });
					return;
				}
				const url = URL.createObjectURL(file);
				webBlobMap.set(url, file);
				currentVideoPath = url;
				resolve({
					success: true,
					path: url,
					kind: "media" as const,
				});
			};
			input.click();
		});
	},
	openAudioFilePicker: async () => {
		return new Promise((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = "audio/*,.mp3,.wav,.ogg,.m4a,.flac";
			input.onchange = (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) {
					resolve({ canceled: true });
					return;
				}
				resolve({
					success: true,
					path: URL.createObjectURL(file),
				});
			};
			input.click();
		});
	},

	// ── Export (browser download) ─────────────────────────────────────────
	openExportStream: async (opts: { extension: string }) => {
		try {
			const root = await navigator.storage.getDirectory();
			const fileName = `export-${Date.now()}.${opts.extension || "mp4"}`;
			const fileHandle = await root.getFileHandle(fileName, { create: true });
			const writable = await fileHandle.createWritable();
			const streamId = fileName; // use filename as ID
			opfsStreams.set(streamId, writable);
			return {
				success: true,
				streamId,
				tempPath: `opfs:/${fileName}`,
			};
		} catch (error) {
			console.error("OPFS open error:", error);
			return { success: false, message: String(error) };
		}
	},
	writeExportStreamChunk: async (streamId: string, position: number, chunk: Uint8Array) => {
		try {
			const writable = opfsStreams.get(streamId);
			if (!writable) throw new Error("Stream not found");
			await writable.write({ type: "write", position, data: chunk as unknown as BufferSource });
			return { success: true };
		} catch (error) {
			console.error("OPFS write error:", error);
			return { success: false, message: String(error) };
		}
	},
	closeExportStream: async (streamId: string, opts?: { abort?: boolean }) => {
		try {
			const writable = opfsStreams.get(streamId);
			if (writable) {
				await writable.close();
				opfsStreams.delete(streamId);
			}
			if (opts?.abort) {
				const root = await navigator.storage.getDirectory();
				await root.removeEntry(streamId).catch(() => {});
			}
			return { success: true, tempPath: `opfs:/${streamId}` };
		} catch (error) {
			console.error("OPFS close error:", error);
			return { success: false, message: String(error) };
		}
	},
	saveExportedFile: async (blob: Blob, suggestedName?: string) => {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = suggestedName || "export.mp4";
		document.body.appendChild(a);
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}, 100);
		return { success: true };
	},
	showSaveDialog: async (opts?: { defaultPath?: string; filters?: unknown[] }) => {
		return {
			canceled: false,
			filePath: opts?.defaultPath || "export.mp4",
		};
	},
	revealFileInFinder: async (_path: string) => {
		// No-op on web
	},
	revealInFolder: async (_path: string) => ({
		success: true,
	}),
	discardExportedTemp: async (path: string) => {
		if (path.startsWith("opfs:/")) {
			try {
				const root = await navigator.storage.getDirectory();
				const fileName = path.replace("opfs:/", "");
				await root.removeEntry(fileName);
			} catch (err) {
				console.error("OPFS discard error:", err);
			}
		}
	},
	finalizeExportedVideo: async (opts: { tempPath: string; fileName: string }) => {
		if (opts.tempPath.startsWith("opfs:/")) {
			try {
				const root = await navigator.storage.getDirectory();
				const fileName = opts.tempPath.replace("opfs:/", "");
				const fileHandle = await root.getFileHandle(fileName);
				const file = await fileHandle.getFile();
				
				// Automatically trigger download
				const url = URL.createObjectURL(file);
				const a = document.createElement("a");
				a.href = url;
				a.download = opts.fileName || "export.mp4";
				document.body.appendChild(a);
				a.click();
				setTimeout(() => {
					document.body.removeChild(a);
					URL.revokeObjectURL(url);
				}, 100);

				// Cleanup the OPFS file to save space
				await root.removeEntry(fileName).catch(() => {});
				
				return { success: true, canceled: false, path: opts.fileName };
			} catch (err) {
				console.error("OPFS finalize error:", err);
				return { success: false, canceled: false, message: String(err) };
			}
		}
		return {
			success: false,
			canceled: false,
			message: "Finalize not supported in web mode for non-OPFS paths.",
			path: null,
		};
	},
	saveExportedVideo: async (
		buffer: ArrayBuffer,
		fileName?: string,
		_captionSidecar?: unknown
	) => {
		try {
			const blob = new Blob([buffer], { type: "video/mp4" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = fileName || "export.mp4";
			document.body.appendChild(a);
			a.click();
			setTimeout(() => {
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}, 100);
			return { success: true, path: fileName || "export.mp4" };
		} catch {
			return { success: false, message: "Failed to save" };
		}
	},

	// ── Native export stubs (not available in web) ───────────────────────
	nativeVideoExportStart: async () => ({
		success: false,
		message: "Native video export not available in web mode.",
	}),
	nativeVideoExportWriteFrame: async () => ({ success: false }),
	nativeVideoExportFinish: async () => ({
		success: false,
		tempPath: null,
	}),
	nativeVideoExportCancel: async () => {},
	nativeStaticLayoutExport: async () => ({
		success: false,
		message: "Native export not available.",
	}),
	muxExportedVideoAudio: async () => ({
		success: false,
		tempPath: null,
	}),
	muxExportedVideoAudioFromPath: async () => ({
		success: false,
		tempPath: null,
	}),
	probeNativeVideoMetadata: async (_path: string) => ({
		success: false,
		metadata: null,
	}),

	// ── Screen recording stubs ───────────────────────────────────────────
	getSources: async () => [],
	getSelectedSource: async () => null,
	selectSource: async () => {},
	getScreenRecordingPermissionStatus: async () => ({
		success: true,
		status: "granted",
	}),
	getAccessibilityPermissionStatus: async () => ({
		success: true,
		trusted: true,
	}),
	requestAccessibilityPermission: async () => ({
		success: true,
		trusted: true,
	}),
	openScreenRecordingPreferences: async () => {},
	openAccessibilityPreferences: async () => {},
	startNativeScreenRecording: async () => ({ success: false }),
	stopNativeScreenRecording: async () => ({
		success: false,
		path: null,
	}),
	cancelNativeScreenRecording: async () => ({ success: true }),
	recoverNativeScreenRecording: async () => ({
		success: false,
		path: null,
	}),
	storeRecordedVideo: async () => ({
		success: false,
		path: null,
	}),
	storeMicrophoneSidecar: async () => ({ success: false }),
	getLastNativeCaptureDiagnostics: async () => ({
		success: false,
		diagnostics: null,
	}),

	// ── Window management stubs ──────────────────────────────────────────
	switchToEditor: async () => {},
	hudOverlayClose: () => {},
	hudOverlaySetIgnoreMouse: (_ignore: boolean) => {},
	openExternalUrl: async (url: string) => {
		window.open(url, "_blank", "noopener,noreferrer");
	},
	closeWindow: () => {},
	minimizeWindow: () => {},
	maximizeWindow: () => {},

	// ── Cursor telemetry ─────────────────────────────────────────────────
	getCursorTelemetry: async (_path: string) => ({
		success: false,
		telemetry: null,
	}),
	getAutoZoomSuggestions: async () => ({
		success: false,
		suggestions: [],
	}),

	// ── Whisper / auto-captions ──────────────────────────────────────────
	getWhisperExecutablePath: async () => ({
		success: false,
		path: null,
	}),
	getWhisperModelPath: async () => ({
		success: false,
		path: null,
	}),
	downloadWhisperModel: async () => ({
		success: false,
	}),
	cancelWhisperModelDownload: async () => {},
	generateCaptions: async () => ({
		success: false,
		captions: [],
	}),

	// ── Webcam ───────────────────────────────────────────────────────────
	openWebcamFilePicker: async () => {
		return new Promise((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = "video/*";
			input.onchange = (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) {
					resolve({ canceled: true });
					return;
				}
				resolve({
					success: true,
					path: URL.createObjectURL(file),
				});
			};
			input.click();
		});
	},

	// ── Source audio fallback ─────────────────────────────────────────────
	getSourceAudioFallbackPaths: async () => ({
		success: true,
		paths: [],
	}),

	// ── Announcements ────────────────────────────────────────────────────
	getAnnouncements: async () => ({
		success: true,
		announcements: [],
	}),

	// ── Menu IPC listeners (no-op on web) ────────────────────────────────
	onMenuLoadProject: () => () => {},
	onMenuSaveProject: () => () => {},
	onMenuSaveProjectAs: () => () => {},
	onRecordingSessionChanged: () => () => {},
	onNativeStaticLayoutExportProgress: () => () => {},
	onWhisperModelDownloadProgress: () => () => {},
	onCaptionGenerationProgress: () => () => {},
	onUpdateAvailable: () => () => {},
	onUpdateDownloaded: () => () => {},
	onDeepLink: () => () => {},
};

// ---------------------------------------------------------------------------
// Install: replaces the Proxy-based mock with explicit implementations
// ---------------------------------------------------------------------------

export function installWebElectronAPI() {
	if (typeof window === "undefined") return;
	if ((window as any).__electronAPIIsNative) return; // real Electron – don't override

	const handler: ProxyHandler<Record<string, Function>> = {
		get(target, prop) {
			if (typeof prop === "symbol") return undefined;
			if (prop in target) return target[prop];
			// Fallback for any method we haven't explicitly listed:
			// "on*" listeners return a no-op unsubscribe, everything else
			// returns an async empty-object to avoid null-reference crashes.
			if (prop.startsWith("on")) return () => () => {};
			return async () => ({});
		},
	};

	(window as any).electronAPI = new Proxy(webElectronAPI, handler);
}
