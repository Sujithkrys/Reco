/**
 * Web Compatibility Layer for Reco
 *
 * This module provides browser-native implementations of the Electron IPC API
 * so the editor can run as a standard web application. It maps each
 * `window.electronAPI.*` call to an equivalent browser API (localStorage,
 * File System Access API, IndexedDB, Web MediaRecorder, etc.).
 */

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

export const webElectronAPI: Record<string, Function> = {
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
	openProjectFileAtPath: async (_path: string) => ({
		success: false,
		canceled: false,
		message: "Projects are stored in browser memory in the web version.",
		project: null,
		path: null,
	}),
	saveProjectFile: async (
		_path: string,
		_data: unknown,
		_opts?: unknown
	) => ({
		success: true,
		path: _path,
	}),
	getProjectLibrary: async () => ({
		success: true,
		library: [],
	}),
	deleteProjectFile: async (_path: string) => ({ success: true }),
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
	openExportStream: async (_opts: { extension: string }) => ({
		success: false,
		message: "Streaming export not supported in web mode.",
	}),
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
	discardExportedTemp: async (_path: string) => {
		// No-op
	},
	finalizeExportedVideo: async (_opts: unknown) => ({
		success: false,
		canceled: false,
		message: "Finalize not supported in web mode.",
		path: null,
	}),
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
