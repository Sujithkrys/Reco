/**
 * Web Compatibility Layer for Reco
 *
 * This module provides browser-native implementations of the Electron IPC API
 * so the editor can run as a standard web application. It maps each
 * `window.electronAPI.*` call to an equivalent browser API (localStorage,
 * File System Access API, IndexedDB, Web MediaRecorder, etc.).
 */

import { supabase } from "./supabase";
import { set, get, keys, del } from "idb-keyval";
import * as tus from "tus-js-client";

export const webBlobMap = new Map<string, Blob | File>();
export const opfsStreams = new Map<string, FileSystemWritableFileStream>();

interface WebCursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
	interactionType?: string;
	cursorType?: string;
}
export const cursorTelemetryMap = new Map<string, WebCursorTelemetryPoint[]>();

/** Local media path/blob URL -> remote Supabase Storage object path. */
export const uploadedMediaPaths = new Map<string, string>();

/**
 * Blob URL -> IndexedDB key of the media already stored for it. Lets repeated
 * saves (autosave in particular) and saves of a reopened project reuse the
 * stored copy instead of writing the same file again on every save.
 */
const persistedMediaKeys = new Map<string, string>();

async function persistProjectMedia(projectData: unknown): Promise<unknown> {
	let jsonString = JSON.stringify(projectData);
	const blobRegex = /"blob:(https?:\/\/[^"]+)"/g;
	const blobUrls = new Set<string>();
	let match;
	while ((match = blobRegex.exec(jsonString)) !== null) {
		blobUrls.add(`blob:${match[1]}`);
	}

	for (const blobUrl of blobUrls) {
		const existingKey = persistedMediaKeys.get(blobUrl);
		if (existingKey) {
			jsonString = jsonString.split(blobUrl).join(`idb://${existingKey}`);
			continue;
		}
		let blob: Blob;
		try {
			const response = await fetch(blobUrl);
			if (!response.ok) continue;
			blob = await response.blob();
		} catch (err) {
			console.error(`Failed to read blob ${blobUrl}:`, err);
			continue;
		}
		// A failed write (e.g. quota exceeded) fails the whole save: saving the
		// project with a blob: link would leave dead media after a reload.
		const idbKey = `media_${crypto.randomUUID()}`;
		await set(idbKey, blob);
		persistedMediaKeys.set(blobUrl, idbKey);
		jsonString = jsonString.split(blobUrl).join(`idb://${idbKey}`);
	}
	return JSON.parse(jsonString);
}

async function restoreProjectMedia(projectData: unknown): Promise<unknown> {
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
				persistedMediaKeys.set(freshBlobUrl, idbKey);
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
// Tracks which saved project should be restored on the next page load --
// localStorage (not the in-memory currentVideoPath/currentRecordingSession
// vars below) is the only thing that survives an actual page refresh, since
// a refresh re-executes this whole module from scratch.
const LAST_OPEN_PROJECT_KEY = "reco-last-open-project-id";

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

export const webElectronAPI: unknown = {
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
	// Called when the user deliberately navigates back to the dashboard, so a
	// refresh there stays on the dashboard instead of jumping back into the
	// project that's still recorded as "last open" in localStorage.
	clearCurrentProjectFile: async () => {
		localStorage.removeItem(LAST_OPEN_PROJECT_KEY);
		return { success: true };
	},
	loadCurrentProjectFile: async () => {
		try {
			const lastProjectId = localStorage.getItem(LAST_OPEN_PROJECT_KEY);
			if (!lastProjectId) return { success: false, project: null, path: null };

			const projectRecord = (await get(`project_${lastProjectId}`)) as any;
			if (!projectRecord) return { success: false, project: null, path: null };

			const restoredData = await restoreProjectMedia(projectRecord.editor_state);
			return { success: true, project: restoredData, path: lastProjectId };
		} catch (e: unknown) {
			console.error("Failed to restore last open project:", e);
			return { success: false, project: null, path: null };
		}
	},
	openProjectFileAtPath: async (_path: string) => {
		try {
			const projectRecord = await get(`project_${_path}`) as any;
			if (!projectRecord) throw new Error("Project not found");

			const restoredData = await restoreProjectMedia(projectRecord.editor_state);
			localStorage.setItem(LAST_OPEN_PROJECT_KEY, _path);

			return { success: true, project: restoredData, path: _path };
		} catch (e: unknown) {
			return { success: false, message: (e as Error).message, path: null };
		}
	},
	saveProjectFile: async (
		projectData: unknown,
		fileNameBase?: string,
		targetPath?: string,
		thumbnail?: string
	) => {
		try {
			const projectId = targetPath || crypto.randomUUID();
			
			// Persist all ephemeral blob URLs to IndexedDB
			const persistedData = await persistProjectMedia(projectData);
			
			await set(`project_${projectId}`, {
				id: projectId,
				name: fileNameBase || "Untitled Project",
				editor_state: persistedData,
				thumbnail_url: thumbnail || null,
				updated_at: new Date().toISOString()
			});
			localStorage.setItem(LAST_OPEN_PROJECT_KEY, projectId);

			return { success: true, path: projectId };
		} catch (e: unknown) {
			console.error(e);
			// Everything above is an IndexedDB/localStorage write.
			return { success: false, path: null, message: (e as Error).message, storageError: true };
		}
	},
	// Named to match useProjectLibraryController's refreshProjectLibrary(), the
	// only caller -- this was previously named getProjectLibrary and returned
	// `library` instead of `entries`, so that call has always thrown (caught
	// and silently swallowed), leaving the dashboard's project list empty no
	// matter how many projects were actually saved.
	listProjectFiles: async () => {
		try {
			const allKeys = await keys();
			const projectKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith("project_"));

			const projects = [];
			for (const key of projectKeys) {
				const project = await get(key) as any;
				if (project) {
					projects.push(project);
				}
			}

			projects.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

			const entries = projects.map(p => ({
				path: p.id,
				name: p.name,
				updatedAt: new Date(p.updated_at).getTime(),
				thumbnailPath: p.thumbnail_url,
				isCurrent: false,
				isInProjectsDirectory: true
			}));
			return { success: true, entries };
		} catch (e: unknown) {
			console.error(e);
			return { success: false, entries: [], error: (e as Error).message };
		}
	},
	deleteProjectFile: async (_path: string) => {
		try {
			await del(`project_${_path}`);
			if (localStorage.getItem(LAST_OPEN_PROJECT_KEY) === _path) {
				localStorage.removeItem(LAST_OPEN_PROJECT_KEY);
			}
			return { success: true };
		} catch {
			return { success: false };
		}
	},
	renameProjectFile: async (_path: string, newName: string) => {
		try {
			const projectRecord = (await get(`project_${_path}`)) as any;
			if (!projectRecord) return { success: false, message: "Project not found" };
			await set(`project_${_path}`, {
				...projectRecord,
				name: newName,
				updated_at: new Date().toISOString(),
			});
			return { success: true };
		} catch (e: unknown) {
			return { success: false, message: (e as Error).message };
		}
	},
	getProjectThumbnail: async (_path: string) => ({
		success: false,
		data: null,
	}),

	// ── File pickers (browser native) ────────────────────────────────────
	uploadMediaFile: async (fileOrPath: File | string, options?: { prefix?: string }) => {
		try {
			const { data: sessionData } = await supabase.auth.getSession();
			const token = sessionData?.session?.access_token;
			if (!token) {
				return { success: false, message: "Please sign in to upload media." };
			}

			let file: File;
			if (typeof fileOrPath === "string") {
				const mapFile = webBlobMap.get(fileOrPath);
				if (!mapFile || !(mapFile instanceof File)) {
					return { success: false, message: "File not found in local map" };
				}
				file = mapFile;
			} else {
				file = fileOrPath;
			}
			
			const prefix = options?.prefix || "";
			const fileName = `${prefix}${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
			const bucketName = "projects-media";
			
			// Use TUS for files > 100MB per requirements, but Supabase recommends > 6MB
			if (file.size > 100 * 1024 * 1024) {
				return new Promise((resolve) => {
					const upload = new tus.Upload(file, {
						endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
						retryDelays: [0, 3000, 5000, 10000, 20000],
						headers: {
							authorization: `Bearer ${token}`,
							apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
							'x-upsert': 'true',
						},
						uploadDataDuringCreation: true,
						removeFingerprintOnSuccess: true,
						metadata: {
							bucketName: bucketName,
							objectName: fileName,
							contentType: file.type || "application/octet-stream",
							cacheControl: '3600',
						},
						chunkSize: 6 * 1024 * 1024, // 6MB chunks
						onError: (error) => {
							console.error("TUS upload failed:", error);
							resolve({ success: false, message: String(error) });
						},
						onSuccess: () => {
							resolve({ success: true, path: fileName });
						}
					});
					upload.start();
				});
			} else {
				// Standard upload
				const { data, error } = await supabase.storage.from(bucketName).upload(fileName, file, {
					upsert: true
				});
				if (error) throw error;
				return { success: true, path: data.path };
			}
		} catch (err: any) {
			console.error("Upload error:", err);
			return { success: false, message: err.message || String(err) };
		}
	},
	openVideoFilePicker: async (_opts?: { includeProjects?: boolean }) => {
		return new Promise((resolve) => {
			let settled = false;
			const settle = (value: unknown) => {
				if (settled) return;
				settled = true;
				window.removeEventListener("focus", onWindowFocus);
				resolve(value);
			};
			// The native picker gives no cancel event — detect it by the window
			// regaining focus with no change having fired. Without this a
			// dismissed dialog leaves this promise (and its caller) hanging
			// forever.
			const onWindowFocus = () => {
				window.setTimeout(() => settle({ canceled: true }), 300);
			};
			window.addEventListener("focus", onWindowFocus, { once: true });

			const input = document.createElement("input");
			input.type = "file";
			input.accept = "video/*,.mp4,.webm,.mov,.mkv,.avi";
			input.onchange = (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) {
					settle({ canceled: true });
					return;
				}
				const url = URL.createObjectURL(file);
				webBlobMap.set(url, file);
				currentVideoPath = url;
				settle({
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
			let settled = false;
			const settle = (value: unknown) => {
				if (settled) return;
				settled = true;
				window.removeEventListener("focus", onWindowFocus);
				resolve(value);
			};
			const onWindowFocus = () => {
				window.setTimeout(() => settle({ canceled: true }), 300);
			};
			window.addEventListener("focus", onWindowFocus, { once: true });

			const input = document.createElement("input");
			input.type = "file";
			input.accept = "audio/*,.mp3,.wav,.ogg,.m4a,.flac";
			input.onchange = (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) {
					settle({ canceled: true });
					return;
				}
				const url = URL.createObjectURL(file);
				webBlobMap.set(url, file);
				settle({
					success: true,
					path: url,
					file,
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
				await root.removeEntry(streamId).catch(() => { /* noop */ });
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
				
				// We intentionally DO NOT revoke the URL or remove the OPFS entry here.
				// The browser download manager needs time to stream the file. 
				// The OPFS will act as a temporary cache and old exports can be cleaned up later if needed.
				
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
			
			// We DO NOT revoke the URL immediately so the download has time to complete
			setTimeout(() => {
				document.body.removeChild(a);
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
	nativeVideoExportCancel: async () => { /* noop */ },
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
	selectSource: async () => { /* noop */ },
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
	openScreenRecordingPreferences: async () => { /* noop */ },
	openAccessibilityPreferences: async () => { /* noop */ },
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
	switchToEditor: async () => { /* noop */ },
	hudOverlayClose: () => { /* noop */ },
	hudOverlaySetIgnoreMouse: (_ignore: boolean) => { /* noop */ },
	openExternalUrl: async (url: string) => {
		window.open(url, "_blank", "noopener,noreferrer");
	},
	closeWindow: () => { /* noop */ },
	minimizeWindow: () => { /* noop */ },
	maximizeWindow: () => { /* noop */ },

	// ── Cursor telemetry ─────────────────────────────────────────────────
	getCursorTelemetry: async (path: string) => {
		const samples = cursorTelemetryMap.get(path);
		return samples && samples.length > 0
			? { success: true, samples }
			: { success: false, samples: [] };
	},
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
	cancelWhisperModelDownload: async () => { /* noop */ },
	generateAutoCaptions: async ({ videoPath, targetLanguage }: any) => {
		try {
			console.log("[webElectronAPI] Extracting audio for auto-captions...");
			
			const sourceRes = await fetch(videoPath);
			const sourceBlob = await sourceRes.blob();
			const arrayBuf = await sourceBlob.arrayBuffer();
			const ctx = new window.AudioContext();
			let audioBuffer: AudioBuffer;
			try {
				audioBuffer = await ctx.decodeAudioData(arrayBuf);
			} catch (e) {
				throw new Error("The audio could not be read.");
			}

			const targetSampleRate = 16000;
			const offlineCtx = new window.OfflineAudioContext(1, Math.ceil(audioBuffer.duration * targetSampleRate), targetSampleRate);
			const sourceNode = offlineCtx.createBufferSource();
			sourceNode.buffer = audioBuffer;
			sourceNode.connect(offlineCtx.destination);
			sourceNode.start(0);
			const resampledBuffer = await offlineCtx.startRendering();

			function encodeWAV(buffer: AudioBuffer) {
				const numChannels = buffer.numberOfChannels;
				const sampleRate = buffer.sampleRate;
				const format = 1; 
				const bitDepth = 16;
				const bytesPerSample = bitDepth / 8;
				const blockAlign = numChannels * bytesPerSample;
				const data = buffer.getChannelData(0);
				const bufferLength = data.length * bytesPerSample;
				const arrayBuffer = new ArrayBuffer(44 + bufferLength);
				const view = new DataView(arrayBuffer);
				
				const writeString = (view: DataView, offset: number, string: string) => {
					for (let i = 0; i < string.length; i++) {
						view.setUint8(offset + i, string.charCodeAt(i));
					}
				};
				writeString(view, 0, "RIFF");
				view.setUint32(4, 36 + bufferLength, true);
				writeString(view, 8, "WAVE");
				writeString(view, 12, "fmt ");
				view.setUint32(16, 16, true);
				view.setUint16(20, format, true);
				view.setUint16(22, numChannels, true);
				view.setUint32(24, sampleRate, true);
				view.setUint32(28, sampleRate * blockAlign, true);
				view.setUint16(32, blockAlign, true);
				view.setUint16(34, bitDepth, true);
				writeString(view, 36, "data");
				view.setUint32(40, bufferLength, true);
				
				let offset = 44;
				for (let i = 0; i < data.length; i++) {
					let s = Math.max(-1, Math.min(1, data[i]));
					s = s < 0 ? s * 0x8000 : s * 0x7FFF;
					view.setInt16(offset, s, true);
					offset += 2;
				}
				return new Blob([view], { type: "audio/wav" });
			}

			const MAX_BYTES = 24 * 1024 * 1024;
			const BYTES_PER_SAMPLE = 2;
			const MAX_SAMPLES = Math.floor((MAX_BYTES - 44) / BYTES_PER_SAMPLE);
			const totalSamples = resampledBuffer.length;
			const chunks: { blob: Blob, offsetMs: number }[] = [];
			
			for (let i = 0; i < totalSamples; i += MAX_SAMPLES) {
				const end = Math.min(i + MAX_SAMPLES, totalSamples);
				const chunkLength = end - i;
				const chunkBuffer = offlineCtx.createBuffer(1, chunkLength, 16000);
				chunkBuffer.copyToChannel(resampledBuffer.getChannelData(0).subarray(i, end), 0);
				chunks.push({
					blob: encodeWAV(chunkBuffer),
					offsetMs: (i / 16000) * 1000
				});
			}

			// 2. Call Edge Function directly with FormData (Bypassing Supabase Storage)
			const { supabase } = await import("./supabase");
			const { data: sessionData } = await supabase.auth.getSession();
			const token = sessionData?.session?.access_token;
			if (!token) {
				throw new Error("Please sign in to generate auto-captions.");
			}
			
			let allCues: any[] = [];
			let anySpeechDetected = false;

			for (const chunk of chunks) {
				const formData = new FormData();
				formData.append("file", chunk.blob, "audio-extract.wav");
				if (targetLanguage) {
					formData.append("targetLanguage", targetLanguage);
				}

				const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-and-translate`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
					},
					body: formData,
				});

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`Edge function failed: ${response.status} ${errorText}`);
				}

				const data = await response.json();
				
				if (!data?.success) {
					throw new Error(data?.error || "Edge function failed");
				}

				if (data.cues) {
					allCues.push(...data.cues.map((c: any) => ({
						...c,
						startMs: c.startMs + chunk.offsetMs,
						endMs: c.endMs + chunk.offsetMs
					})));
				}
				if (!data.noSpeechDetected) anySpeechDetected = true;
			}

			const noSpeechDetected = !anySpeechDetected || allCues.length === 0;
			const message = noSpeechDetected
				? "No speech detected"
				: `Generated ${allCues.length} captions`;

			return { 
				success: true, 
				cues: allCues, 
				noSpeechDetected,
				message 
			};
		} catch (error: any) {
			console.error("[webElectronAPI] generateAutoCaptions error:", error);
			return { success: false, error: error.message };
		}
	},

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
	// Web recordings mix mic/system audio into one track at capture time (see
	// useNativeScreenRecording.ts), so there are never separate companion
	// audio files to fall back to here — an empty list is the correct,
	// successful answer, not a failure.
	getVideoAudioFallbackPaths: async () => ({
		success: true,
		paths: [],
	}),

	// ── Announcements ────────────────────────────────────────────────────
	getAnnouncements: async () => ({
		success: true,
		announcements: [],
	}),

	// ── Menu IPC listeners (no-op on web) ────────────────────────────────
	onMenuLoadProject: () => () => { /* noop */ },
	onMenuSaveProject: () => () => { /* noop */ },
	onMenuSaveProjectAs: () => () => { /* noop */ },
	onRecordingSessionChanged: () => () => { /* noop */ },
	onNativeStaticLayoutExportProgress: () => () => { /* noop */ },
	onWhisperModelDownloadProgress: () => () => { /* noop */ },
	onCaptionGenerationProgress: () => () => { /* noop */ },
	onUpdateAvailable: () => () => { /* noop */ },
	onUpdateDownloaded: () => () => { /* noop */ },
	onDeepLink: () => () => { /* noop */ },
};

// ---------------------------------------------------------------------------
// Install: replaces the Proxy-based mock with explicit implementations
// ---------------------------------------------------------------------------

export function installWebElectronAPI() {
	if (typeof window === "undefined") return;
	if ((window as unknown as any).__electronAPIIsNative) return; // real Electron – don't override

	const handler: ProxyHandler<Record<string, (...args: unknown[]) => unknown>> = {
		get(target, prop) {
			if (typeof prop === "symbol") return undefined;
			if (prop in target) return target[prop];
			// Fallback for any method we haven't explicitly listed:
			// "on*" listeners return a no-op unsubscribe, everything else
			// returns an async empty-object to avoid null-reference crashes.
			if (prop.startsWith("on")) return () => () => { /* noop */ };
			return async () => ({});
		},
	};

	(window as unknown as any).electronAPI = new Proxy(webElectronAPI, handler);
}
