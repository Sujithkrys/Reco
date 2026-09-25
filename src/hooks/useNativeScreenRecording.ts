import { fixWebmDuration } from "@fix-webm-duration/fix";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import {
	getVideoExtensionForMimeType,
	selectRecordingMimeType,
	selectWebcamRecordingMimeType,
} from "./recordingMimeType";
import { useMicrophoneDevices } from "./useMicrophoneDevices";
import { useVideoDevices } from "./useVideoDevices";

export type RecordingPhase = "idle" | "starting" | "recording" | "error";

export interface NativeRecordingResult {
	screenBlob: Blob;
	screenMimeType: string;
	screenExtension: ".mp4" | ".webm";
	webcamBlob: Blob | null;
	webcamMimeType: string | null;
	/** ms the webcam recorder started after the screen recorder (may be negative). */
	timeOffsetMs: number;
	durationMs: number;
	/** True when the recording ended because the browser's own "Stop sharing" UI was used. */
	endedBySystem: boolean;
	/**
	 * Cursor position/click telemetry captured during the recording, empty
	 * unless the user shared "This Tab" — browsers expose no API for cursor
	 * position over content outside the page, so window/screen shares can't
	 * produce this (the same real cursor is simply visible in the raw video).
	 */
	cursorTelemetry: CursorTelemetryPoint[];
}

const CURSOR_SAMPLE_INTERVAL_MS = 33;

function mapCssCursorToTelemetryType(cssCursor: string): CursorTelemetryPoint["cursorType"] {
	switch (cssCursor) {
		case "text":
			return "text";
		case "pointer":
			return "pointer";
		case "crosshair":
			return "crosshair";
		case "grab":
			return "open-hand";
		case "grabbing":
			return "closed-hand";
		case "not-allowed":
		case "no-drop":
			return "not-allowed";
		case "ew-resize":
		case "col-resize":
		case "e-resize":
		case "w-resize":
			return "resize-ew";
		case "ns-resize":
		case "row-resize":
		case "n-resize":
		case "s-resize":
			return "resize-ns";
		default:
			return "arrow";
	}
}

function describeGetUserMediaError(error: unknown): string {
	if (error instanceof DOMException) {
		if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
			return "Permission was denied.";
		}
		if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
			return "No device was found.";
		}
		if (error.name === "NotReadableError") {
			return "The device is already in use by another application.";
		}
	}
	return error instanceof Error ? error.message : "Failed to access the device.";
}

function stopStream(stream: MediaStream | null) {
	stream?.getTracks().forEach((track) => track.stop());
}

/**
 * A screen recording's own live-preview UI (the floating "recording…" pill
 * and webcam bubble) is just a normal element in this page — the moment the
 * user switches to a different tab or a different application entirely
 * (extremely common mid-recording: "let me show this other site"), that tab
 * stops being painted on screen at all, so the bubble disappears even though
 * capture keeps running underneath. The browser's Picture-in-Picture API is
 * the standard web-platform answer: it puts a video in its own OS-level
 * floating window that stays on top of every other window and application,
 * not just other tabs — a website's genuine equivalent of the always-visible
 * floating bubble a desktop app or extension would give you.
 *
 * PiP forces itself closed the moment its source <video> element is removed
 * from the document, so this element is deliberately created and owned
 * outside React's render tree (not tied to the launcher dialog, which closes
 * the instant recording starts, or to the indicator pill, which only mounts
 * after) — it must keep existing for as long as the webcam stream does,
 * independent of whatever UI happens to be open.
 */
function createPersistentPipVideo(): HTMLVideoElement {
	const video = document.createElement("video");
	video.muted = true;
	video.playsInline = true;
	video.setAttribute("playsinline", "true");
	video.style.cssText =
		"position:fixed;top:-9999px;left:-9999px;width:2px;height:2px;opacity:0;pointer-events:none;";
	document.body.appendChild(video);
	return video;
}

function destroyPersistentPipVideo(video: HTMLVideoElement | null) {
	if (!video) return;
	if (document.pictureInPictureElement === video) {
		document.exitPictureInPicture().catch(() => undefined);
	}
	video.pause();
	video.srcObject = null;
	video.remove();
}

const CAMERA_NO_FRAMES_MESSAGE =
	"Camera access was granted, but no picture is coming through. Close any other app that might be using the camera (Windows only lets one app at a time), then check Settings → Privacy & security → Camera to make sure browser access is turned on.";

/**
 * getUserMedia() resolving is not proof the camera is actually delivering
 * frames — a track can come back "live" while genuinely dark (OS-level
 * camera privacy blocking the browser, or another app holding the device
 * exclusively) with no error ever thrown. Detect that silent case instead
 * of just leaving the preview blank with no explanation.
 */
function watchWebcamFrameLiveness(
	stream: MediaStream,
	onNoFrames: () => void,
	onFramesArrived: () => void,
): () => void {
	const videoTrack = stream.getVideoTracks()[0];
	let settled = false;
	const probe = document.createElement("video");
	probe.muted = true;
	probe.playsInline = true;
	probe.srcObject = stream;

	const finish = (hasFrames: boolean) => {
		if (settled) return;
		settled = true;
		probe.pause();
		probe.srcObject = null;
		if (hasFrames) onFramesArrived();
		else onNoFrames();
	};

	const checkForFrames = () => {
		if (probe.videoWidth > 0 && probe.videoHeight > 0) finish(true);
	};
	probe.addEventListener("loadedmetadata", checkForFrames);
	probe.addEventListener("playing", checkForFrames);
	videoTrack?.addEventListener("mute", () => finish(false));
	void probe.play().catch(() => undefined);

	const timeoutId = window.setTimeout(() => finish(false), 3500);

	return () => {
		window.clearTimeout(timeoutId);
		settled = true;
		probe.pause();
		probe.srcObject = null;
	};
}

/**
 * MediaRecorder-produced webm/matroska files don't carry duration metadata,
 * so `video.duration` reads back as `Infinity` — which the editor's
 * duration-driven timeline/render code can't handle. Patch it in for any
 * webm/matroska output; other containers (e.g. real mp4) already have it.
 */
async function fixRecordingBlobDuration(blob: Blob, durationMs: number): Promise<Blob> {
	if (!/webm|matroska/i.test(blob.type) || !Number.isFinite(durationMs) || durationMs <= 0) {
		return blob;
	}
	try {
		return await fixWebmDuration(blob, durationMs, { logger: false });
	} catch {
		return blob;
	}
}

export function isNativeScreenRecordingSupported(): boolean {
	return (
		typeof navigator !== "undefined" &&
		Boolean(navigator.mediaDevices) &&
		typeof navigator.mediaDevices.getDisplayMedia === "function" &&
		typeof window !== "undefined" &&
		typeof window.MediaRecorder !== "undefined"
	);
}

/**
 * @param enabled Only probe for camera/mic devices (and their labels, which
 * itself requires a permission prompt) while this is true — e.g. while the
 * recording launcher dialog is actually open. Doing this unconditionally at
 * mount time fires a camera/mic permission attempt the moment the editor
 * loads, before the user has expressed any intent to record; if that silent
 * background attempt resolves (denied, ignored, ...) before the user ever
 * opens the dialog, a later toggle click sees an already-settled "no" with
 * no new prompt — which looks exactly like "the toggle does nothing."
 */
export function useNativeScreenRecording(enabled: boolean = true) {
	const [phase, setPhase] = useState<RecordingPhase>("idle");
	const [error, setError] = useState<string | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);

	const [webcamEnabled, setWebcamEnabledState] = useState(false);
	const [micEnabled, setMicEnabledState] = useState(false);
	const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
	const [webcamError, setWebcamError] = useState<string | null>(null);
	const [micError, setMicError] = useState<string | null>(null);
	const [micLevel, setMicLevel] = useState(0);
	const [micReady, setMicReady] = useState(false);

	const videoDevices = useVideoDevices(enabled);
	const micDevices = useMicrophoneDevices(enabled);

	const webcamStreamRef = useRef<MediaStream | null>(null);
	const micStreamRef = useRef<MediaStream | null>(null);
	const webcamRequestIdRef = useRef(0);
	const webcamFrameWatchCleanupRef = useRef<(() => void) | null>(null);
	const pipVideoRef = useRef<HTMLVideoElement | null>(null);
	const [pipActive, setPipActive] = useState(false);
	const micRequestIdRef = useRef(0);
	// Resolves once the in-flight getUserMedia() call for the current toggle
	// state has settled (stream acquired, or failed). `start()` awaits these
	// before deciding whether to record webcam/mic — without this, clicking
	// "Start Recording" right after flipping a toggle (the natural, fast UX)
	// could race the async getUserMedia() call and silently record with the
	// toggle on but the stream still null, dropping webcam/mic from the
	// output while the UI showed them as enabled.
	const webcamAcquisitionRef = useRef<Promise<void>>(Promise.resolve());
	const micAcquisitionRef = useRef<Promise<void>>(Promise.resolve());

	const micAudioContextRef = useRef<AudioContext | null>(null);
	const micAnalyserRef = useRef<AnalyserNode | null>(null);
	const micLevelFrameRef = useRef<number | null>(null);

	const screenStreamRef = useRef<MediaStream | null>(null);
	const mainRecorderRef = useRef<MediaRecorder | null>(null);
	const webcamRecorderRef = useRef<MediaRecorder | null>(null);
	const mainChunksRef = useRef<Blob[]>([]);
	const webcamChunksRef = useRef<Blob[]>([]);
	const mixAudioContextRef = useRef<AudioContext | null>(null);
	const elapsedIntervalRef = useRef<number | null>(null);
	const startedAtRef = useRef(0);
	const mainStartPerfRef = useRef(0);
	const webcamStartPerfRef = useRef<number | null>(null);
	const cursorTelemetryRef = useRef<CursorTelemetryPoint[]>([]);
	const cursorCaptureCleanupRef = useRef<(() => void) | null>(null);
	const lastCursorSampleAtRef = useRef(0);
	const endedBySystemRef = useRef(false);
	const stopRequestedRef = useRef(false);
	const [lastResult, setLastResult] = useState<NativeRecordingResult | null>(null);

	// ---------------------------------------------------------------------
	// Mic level meter — driven off the already-acquired mic stream, not a
	// second getUserMedia call.
	// ---------------------------------------------------------------------
	const teardownMicLevelMeter = useCallback(() => {
		if (micLevelFrameRef.current !== null) {
			cancelAnimationFrame(micLevelFrameRef.current);
			micLevelFrameRef.current = null;
		}
		micAnalyserRef.current = null;
		if (micAudioContextRef.current) {
			micAudioContextRef.current.close().catch(() => undefined);
			micAudioContextRef.current = null;
		}
		setMicLevel(0);
	}, []);

	const setupMicLevelMeter = useCallback((stream: MediaStream) => {
		teardownMicLevelMeter();
		const audioContext = new AudioContext();
		micAudioContextRef.current = audioContext;
		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;
		analyser.smoothingTimeConstant = 0.75;
		micAnalyserRef.current = analyser;
		const source = audioContext.createMediaStreamSource(stream);
		source.connect(analyser);

		const dataArray = new Uint8Array(analyser.frequencyBinCount);
		const tick = () => {
			if (!micAnalyserRef.current) return;
			analyser.getByteFrequencyData(dataArray);
			let sum = 0;
			for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
			const rms = Math.sqrt(sum / dataArray.length);
			setMicLevel(Math.min(100, (rms / 255) * 100 * 2));
			micLevelFrameRef.current = requestAnimationFrame(tick);
		};
		tick();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [teardownMicLevelMeter]);

	// ---------------------------------------------------------------------
	// Webcam toggle → lazily acquire/release the camera stream.
	// ---------------------------------------------------------------------
	const setWebcamEnabled = useCallback(
		(enabled: boolean) => {
			setWebcamEnabledState(enabled);
			const requestId = ++webcamRequestIdRef.current;
			webcamFrameWatchCleanupRef.current?.();
			webcamFrameWatchCleanupRef.current = null;
			if (!enabled) {
				destroyPersistentPipVideo(pipVideoRef.current);
				pipVideoRef.current = null;
				setPipActive(false);
				stopStream(webcamStreamRef.current);
				webcamStreamRef.current = null;
				setWebcamStream(null);
				setWebcamError(null);
				return;
			}
			setWebcamError(null);
			webcamAcquisitionRef.current = (async () => {
				try {
					const stream = await navigator.mediaDevices.getUserMedia({
						video: {
							deviceId: videoDevices.selectedDeviceId !== "default"
								? { exact: videoDevices.selectedDeviceId }
								: undefined,
							width: { ideal: 1280 },
							height: { ideal: 720 },
						},
						audio: false,
					});
					if (requestId !== webcamRequestIdRef.current) {
						stopStream(stream);
						return;
					}
					webcamStreamRef.current = stream;
					setWebcamStream(stream);
					pipVideoRef.current ??= createPersistentPipVideo();
					pipVideoRef.current.srcObject = stream;
					void pipVideoRef.current.play().catch(() => undefined);
					webcamFrameWatchCleanupRef.current = watchWebcamFrameLiveness(
						stream,
						() => {
							if (requestId !== webcamRequestIdRef.current) return;
							setWebcamError(CAMERA_NO_FRAMES_MESSAGE);
						},
						() => {
							if (requestId !== webcamRequestIdRef.current) return;
							setWebcamError(null);
						},
					);
				} catch (err) {
					if (requestId !== webcamRequestIdRef.current) return;
					setWebcamError(describeGetUserMediaError(err));
					setWebcamEnabledState(false);
				}
			})();
		},
		[videoDevices.selectedDeviceId],
	);

	// Keep pipActive in sync however Picture-in-Picture actually ends — the
	// user closing the floating window themselves is just as valid an exit as
	// our own code calling exitPictureInPicture().
	// biome-ignore lint/correctness/useExhaustiveDependencies: webcamStream re-runs this after pipVideoRef.current is (re)created; its value is never read inside the effect.
	useEffect(() => {
		const video = pipVideoRef.current;
		if (!video) return;
		const handleEnter = () => setPipActive(true);
		const handleLeave = () => setPipActive(false);
		video.addEventListener("enterpictureinpicture", handleEnter);
		video.addEventListener("leavepictureinpicture", handleLeave);
		return () => {
			video.removeEventListener("enterpictureinpicture", handleEnter);
			video.removeEventListener("leavepictureinpicture", handleLeave);
		};
	}, [webcamStream]);

	/**
	 * Puts the webcam feed into an OS-level floating window that stays on top
	 * of every other window and application — not just other browser tabs —
	 * so it's still visible once the user switches away from this tab mid
	 * recording. Must be called synchronously from a real user gesture (e.g.
	 * the "Start Recording" click) per the Picture-in-Picture spec; awaiting
	 * anything first (like the screen-share picker) can spend that gesture's
	 * activation window before this ever runs.
	 */
	const requestWebcamPictureInPicture = useCallback(async (): Promise<boolean> => {
		const video = pipVideoRef.current;
		if (
			!video ||
			typeof document === "undefined" ||
			!document.pictureInPictureEnabled ||
			typeof video.requestPictureInPicture !== "function"
		) {
			return false;
		}
		try {
			if (document.pictureInPictureElement !== video) {
				await video.requestPictureInPicture();
			}
			return true;
		} catch {
			return false;
		}
	}, []);

	const setMicEnabled = useCallback(
		(enabled: boolean) => {
			setMicEnabledState(enabled);
			const requestId = ++micRequestIdRef.current;
			if (!enabled) {
				stopStream(micStreamRef.current);
				micStreamRef.current = null;
				teardownMicLevelMeter();
				setMicError(null);
				setMicReady(false);
				return;
			}
			setMicError(null);
			setMicReady(false);
			micAcquisitionRef.current = (async () => {
				try {
					const stream = await navigator.mediaDevices.getUserMedia({
						audio: {
							deviceId: micDevices.selectedDeviceId !== "default"
								? { exact: micDevices.selectedDeviceId }
								: undefined,
							echoCancellation: true,
							noiseSuppression: true,
						},
						video: false,
					});
					if (requestId !== micRequestIdRef.current) {
						stopStream(stream);
						return;
					}
					micStreamRef.current = stream;
					setupMicLevelMeter(stream);
					setMicReady(true);
				} catch (err) {
					if (requestId !== micRequestIdRef.current) return;
					setMicError(describeGetUserMediaError(err));
					setMicEnabledState(false);
					setMicReady(false);
				}
			})();
		},
		[micDevices.selectedDeviceId, setupMicLevelMeter, teardownMicLevelMeter],
	);

	// Re-acquire the relevant stream when the user switches device mid-setup.
	useEffect(() => {
		if (webcamEnabled) setWebcamEnabled(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [videoDevices.selectedDeviceId]);
	useEffect(() => {
		if (micEnabled) setMicEnabled(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [micDevices.selectedDeviceId]);

	useEffect(() => {
		return () => {
			webcamFrameWatchCleanupRef.current?.();
			destroyPersistentPipVideo(pipVideoRef.current);
			pipVideoRef.current = null;
			stopStream(webcamStreamRef.current);
			stopStream(micStreamRef.current);
			stopStream(screenStreamRef.current);
			teardownMicLevelMeter();
			if (mixAudioContextRef.current) {
				mixAudioContextRef.current.close().catch(() => undefined);
			}
			if (elapsedIntervalRef.current !== null) {
				window.clearInterval(elapsedIntervalRef.current);
			}
		};
	}, [teardownMicLevelMeter]);

	const finalize = useCallback(async (durationMs: number): Promise<NativeRecordingResult> => {
		const screenMimeType = mainRecorderRef.current?.mimeType || "video/webm";
		const webcamMimeType = webcamRecorderRef.current?.mimeType || null;
		const rawScreenBlob = new Blob(mainChunksRef.current, { type: screenMimeType });
		const rawWebcamBlob = webcamChunksRef.current.length
			? new Blob(webcamChunksRef.current, { type: webcamMimeType ?? "video/webm" })
			: null;

		const screenBlob = await fixRecordingBlobDuration(rawScreenBlob, durationMs);
		const webcamBlob = rawWebcamBlob
			? await fixRecordingBlobDuration(rawWebcamBlob, durationMs)
			: null;

		return {
			screenBlob,
			screenMimeType,
			screenExtension: getVideoExtensionForMimeType(screenMimeType),
			webcamBlob,
			webcamMimeType: webcamBlob ? webcamMimeType : null,
			timeOffsetMs:
				webcamStartPerfRef.current !== null
					? Math.round(webcamStartPerfRef.current - mainStartPerfRef.current)
					: 0,
			durationMs,
			endedBySystem: endedBySystemRef.current,
			cursorTelemetry: cursorTelemetryRef.current,
		};
	}, []);

	// -----------------------------------------------------------------------
	// Cursor telemetry — only meaningful when the user shares "This Tab":
	// browsers expose no way to read cursor position over content outside the
	// page, so window/monitor shares can never produce real samples here.
	// -----------------------------------------------------------------------
	const stopCursorCapture = useCallback(() => {
		cursorCaptureCleanupRef.current?.();
		cursorCaptureCleanupRef.current = null;
	}, []);

	const startCursorCapture = useCallback(() => {
		stopCursorCapture();
		cursorTelemetryRef.current = [];
		lastCursorSampleAtRef.current = 0;

		const pushSample = (point: CursorTelemetryPoint) => {
			cursorTelemetryRef.current.push(point);
		};
		const cursorTypeAt = (x: number, y: number): CursorTelemetryPoint["cursorType"] => {
			const el = document.elementFromPoint(x, y);
			if (!el) return "arrow";
			return mapCssCursorToTelemetryType(getComputedStyle(el).cursor);
		};
		const normalized = (clientX: number, clientY: number) => ({
			cx: Math.min(1, Math.max(0, clientX / window.innerWidth)),
			cy: Math.min(1, Math.max(0, clientY / window.innerHeight)),
		});

		const handleMove = (event: PointerEvent) => {
			const now = performance.now();
			if (now - lastCursorSampleAtRef.current < CURSOR_SAMPLE_INTERVAL_MS) return;
			lastCursorSampleAtRef.current = now;
			const { cx, cy } = normalized(event.clientX, event.clientY);
			pushSample({
				timeMs: Date.now() - startedAtRef.current,
				cx,
				cy,
				interactionType: "move",
				cursorType: cursorTypeAt(event.clientX, event.clientY),
			});
		};
		const handleDown = (event: PointerEvent) => {
			const { cx, cy } = normalized(event.clientX, event.clientY);
			pushSample({
				timeMs: Date.now() - startedAtRef.current,
				cx,
				cy,
				interactionType:
					event.button === 2 ? "right-click" : event.button === 1 ? "middle-click" : "click",
				cursorType: cursorTypeAt(event.clientX, event.clientY),
			});
		};
		const handleUp = (event: PointerEvent) => {
			const { cx, cy } = normalized(event.clientX, event.clientY);
			pushSample({
				timeMs: Date.now() - startedAtRef.current,
				cx,
				cy,
				interactionType: "mouseup",
			});
		};
		const handleDblClick = (event: MouseEvent) => {
			const { cx, cy } = normalized(event.clientX, event.clientY);
			pushSample({
				timeMs: Date.now() - startedAtRef.current,
				cx,
				cy,
				interactionType: "double-click",
			});
		};

		window.addEventListener("pointermove", handleMove, { passive: true });
		window.addEventListener("pointerdown", handleDown, { passive: true });
		window.addEventListener("pointerup", handleUp, { passive: true });
		window.addEventListener("dblclick", handleDblClick, { passive: true });

		cursorCaptureCleanupRef.current = () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerdown", handleDown);
			window.removeEventListener("pointerup", handleUp);
			window.removeEventListener("dblclick", handleDblClick);
		};
	}, [stopCursorCapture]);

	const teardownRecordingResources = useCallback(() => {
		stopCursorCapture();
		stopStream(screenStreamRef.current);
		screenStreamRef.current = null;
		webcamFrameWatchCleanupRef.current?.();
		webcamFrameWatchCleanupRef.current = null;
		destroyPersistentPipVideo(pipVideoRef.current);
		pipVideoRef.current = null;
		setPipActive(false);
		stopStream(webcamStreamRef.current);
		webcamStreamRef.current = null;
		setWebcamStream(null);
		setWebcamEnabledState(false);
		stopStream(micStreamRef.current);
		micStreamRef.current = null;
		setMicEnabledState(false);
		setMicReady(false);
		teardownMicLevelMeter();
		if (mixAudioContextRef.current) {
			mixAudioContextRef.current.close().catch(() => undefined);
			mixAudioContextRef.current = null;
		}
		if (elapsedIntervalRef.current !== null) {
			window.clearInterval(elapsedIntervalRef.current);
			elapsedIntervalRef.current = null;
		}
	}, [stopCursorCapture, teardownMicLevelMeter]);

	const performStop = useCallback(() => {
		if (stopRequestedRef.current) return;
		stopRequestedRef.current = true;

		const mainRecorder = mainRecorderRef.current;
		const webcamRecorder = webcamRecorderRef.current;
		const durationMs = Date.now() - startedAtRef.current;

		const stopOne = (recorder: MediaRecorder | null) =>
			new Promise<void>((resolve) => {
				if (!recorder || recorder.state === "inactive") {
					resolve();
					return;
				}
				recorder.addEventListener("stop", () => resolve(), { once: true });
				recorder.stop();
			});

		void Promise.all([stopOne(mainRecorder), stopOne(webcamRecorder)])
			.then(() => finalize(durationMs))
			.then((result) => {
				teardownRecordingResources();
				mainRecorderRef.current = null;
				webcamRecorderRef.current = null;
				stopRequestedRef.current = false;
				setPhase("idle");
				setLastResult(result);
			});
	}, [finalize, teardownRecordingResources]);

	/** Triggers a stop; the finished recording arrives via `lastResult`. */
	const stop = useCallback(() => {
		if (phase !== "recording") return;
		performStop();
	}, [performStop, phase]);

	const clearLastResult = useCallback(() => {
		setLastResult(null);
	}, []);

	const cancel = useCallback(() => {
		stopRequestedRef.current = true;
		mainRecorderRef.current?.stop();
		webcamRecorderRef.current?.stop();
		mainRecorderRef.current = null;
		webcamRecorderRef.current = null;
		mainChunksRef.current = [];
		webcamChunksRef.current = [];
		teardownRecordingResources();
		setPhase("idle");
		stopRequestedRef.current = false;
	}, [teardownRecordingResources]);

	const start = useCallback(async () => {
		if (!isNativeScreenRecordingSupported()) {
			setError("Screen recording isn't supported in this browser.");
			setPhase("error");
			return;
		}
		setError(null);
		setPhase("starting");
		endedBySystemRef.current = false;
		stopRequestedRef.current = false;
		mainChunksRef.current = [];
		webcamChunksRef.current = [];

		let screenStream: MediaStream;
		try {
			// `cursor: "never"` stops the browser compositing the real OS cursor
			// into the captured pixels at all (a CSS-level `cursor:none` on the
			// page does NOT achieve this — the capture composites the cursor
			// independently of page styling). We restore it below for shares
			// where we have no telemetry to replace it with.
			screenStream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					frameRate: { ideal: 60, max: 60 },
					cursor: "never",
				} as MediaTrackConstraints,
				audio: true,
			});
		} catch (err) {
			setError(describeGetUserMediaError(err));
			setPhase("error");
			return;
		}
		screenStreamRef.current = screenStream;

		// Make sure any in-flight webcam/mic getUserMedia() calls from a toggle
		// the user just flipped have actually settled before we decide what to
		// record — otherwise a fast "toggle on, then click Start" click could
		// beat the async permission/device resolution and silently record
		// without them despite the UI showing them enabled.
		await Promise.all([webcamAcquisitionRef.current, micAcquisitionRef.current]);

		const screenVideoTrack = screenStream.getVideoTracks()[0];
		// "This Tab" is the only share type where in-page pointer events line up
		// with what's actually being recorded, so that's the only case where
		// cursor telemetry (and therefore the cursor style/click-effect panel)
		// can produce real, correctly-positioned data.
		if (screenVideoTrack.getSettings().displaySurface === "browser") {
			startCursorCapture();
		} else {
			// No telemetry will exist to drive a stylized cursor here, so put
			// the real one back rather than leaving the recording cursor-less.
			// Not all browsers allow changing `cursor` after capture starts —
			// if this is unsupported it just silently stays hidden.
			void screenVideoTrack
				.applyConstraints({ cursor: "always" } as MediaTrackConstraints)
				.catch(() => undefined);
		}
		screenVideoTrack.addEventListener(
			"ended",
			() => {
				if (mainRecorderRef.current?.state === "recording") {
					endedBySystemRef.current = true;
					performStop();
				}
			},
			{ once: true },
		);

		// Mix mic audio (if enabled) with any system audio the share included.
		const mixContext = new AudioContext();
		mixAudioContextRef.current = mixContext;
		const destination = mixContext.createMediaStreamDestination();
		const systemAudioTracks = screenStream.getAudioTracks();
		if (systemAudioTracks.length > 0) {
			mixContext.createMediaStreamSource(new MediaStream(systemAudioTracks)).connect(destination);
		}
		if (micEnabled && micStreamRef.current) {
			mixContext.createMediaStreamSource(micStreamRef.current).connect(destination);
		}

		const mixedAudioTrack = destination.stream.getAudioTracks()[0];
		const mainStream = new MediaStream(
			mixedAudioTrack ? [screenVideoTrack, mixedAudioTrack] : [screenVideoTrack],
		);

		const screenMimeType = selectRecordingMimeType();
		const mainRecorder = new MediaRecorder(
			mainStream,
			{
				...(screenMimeType ? { mimeType: screenMimeType } : {}),
				videoBitsPerSecond: 8000000,
			}
		);
		mainRecorder.ondataavailable = (event) => {
			if (event.data.size > 0) mainChunksRef.current.push(event.data);
		};
		mainRecorderRef.current = mainRecorder;

		let webcamRecorder: MediaRecorder | null = null;
		if (webcamEnabled && webcamStreamRef.current) {
			const webcamMimeType = selectWebcamRecordingMimeType();
			webcamRecorder = new MediaRecorder(
				webcamStreamRef.current,
				{
					...(webcamMimeType ? { mimeType: webcamMimeType } : {}),
					videoBitsPerSecond: 3000000,
				}
			);
			webcamRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) webcamChunksRef.current.push(event.data);
			};
			webcamRecorderRef.current = webcamRecorder;
		}

		startedAtRef.current = Date.now();
		webcamStartPerfRef.current = null;
		mainStartPerfRef.current = performance.now();
		mainRecorder.start(1000);
		if (webcamRecorder) {
			webcamStartPerfRef.current = performance.now();
			webcamRecorder.start(1000);
		}

		setPhase("recording");
		setElapsedMs(0);
		elapsedIntervalRef.current = window.setInterval(() => {
			setElapsedMs(Date.now() - startedAtRef.current);
		}, 250);
	}, [micEnabled, performStop, startCursorCapture, webcamEnabled]);

	return {
		phase,
		error,
		elapsedMs,
		isSupported: isNativeScreenRecordingSupported(),
		webcamEnabled,
		setWebcamEnabled,
		micEnabled,
		setMicEnabled,
		webcamStream,
		webcamError,
		micError,
		micLevel,
		micReady,
		pipActive,
		requestWebcamPictureInPicture,
		videoDevices,
		micDevices,
		lastResult,
		clearLastResult,
		start,
		stop,
		cancel,
	};
}

export type UseNativeScreenRecording = ReturnType<typeof useNativeScreenRecording>;
