import { useCallback, useEffect, useRef, useState } from "react";
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

export function isNativeScreenRecordingSupported(): boolean {
	return (
		typeof navigator !== "undefined" &&
		Boolean(navigator.mediaDevices) &&
		typeof navigator.mediaDevices.getDisplayMedia === "function" &&
		typeof window !== "undefined" &&
		typeof window.MediaRecorder !== "undefined"
	);
}

export function useNativeScreenRecording() {
	const [phase, setPhase] = useState<RecordingPhase>("idle");
	const [error, setError] = useState<string | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);

	const [webcamEnabled, setWebcamEnabledState] = useState(false);
	const [micEnabled, setMicEnabledState] = useState(false);
	const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
	const [webcamError, setWebcamError] = useState<string | null>(null);
	const [micError, setMicError] = useState<string | null>(null);
	const [micLevel, setMicLevel] = useState(0);

	const videoDevices = useVideoDevices(true);
	const micDevices = useMicrophoneDevices(true);

	const webcamStreamRef = useRef<MediaStream | null>(null);
	const micStreamRef = useRef<MediaStream | null>(null);
	const webcamRequestIdRef = useRef(0);
	const micRequestIdRef = useRef(0);

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
			if (!enabled) {
				stopStream(webcamStreamRef.current);
				webcamStreamRef.current = null;
				setWebcamStream(null);
				setWebcamError(null);
				return;
			}
			setWebcamError(null);
			void (async () => {
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
				} catch (err) {
					if (requestId !== webcamRequestIdRef.current) return;
					setWebcamError(describeGetUserMediaError(err));
					setWebcamEnabledState(false);
				}
			})();
		},
		[videoDevices.selectedDeviceId],
	);

	const setMicEnabled = useCallback(
		(enabled: boolean) => {
			setMicEnabledState(enabled);
			const requestId = ++micRequestIdRef.current;
			if (!enabled) {
				stopStream(micStreamRef.current);
				micStreamRef.current = null;
				teardownMicLevelMeter();
				setMicError(null);
				return;
			}
			setMicError(null);
			void (async () => {
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
				} catch (err) {
					if (requestId !== micRequestIdRef.current) return;
					setMicError(describeGetUserMediaError(err));
					setMicEnabledState(false);
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

	const finalize = useCallback((durationMs: number): NativeRecordingResult => {
		const screenMimeType = mainRecorderRef.current?.mimeType || "video/webm";
		const webcamMimeType = webcamRecorderRef.current?.mimeType || null;
		const screenBlob = new Blob(mainChunksRef.current, { type: screenMimeType });
		const webcamBlob = webcamChunksRef.current.length
			? new Blob(webcamChunksRef.current, { type: webcamMimeType ?? "video/webm" })
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
		};
	}, []);

	const teardownRecordingResources = useCallback(() => {
		stopStream(screenStreamRef.current);
		screenStreamRef.current = null;
		stopStream(webcamStreamRef.current);
		webcamStreamRef.current = null;
		setWebcamStream(null);
		setWebcamEnabledState(false);
		stopStream(micStreamRef.current);
		micStreamRef.current = null;
		setMicEnabledState(false);
		teardownMicLevelMeter();
		if (mixAudioContextRef.current) {
			mixAudioContextRef.current.close().catch(() => undefined);
			mixAudioContextRef.current = null;
		}
		if (elapsedIntervalRef.current !== null) {
			window.clearInterval(elapsedIntervalRef.current);
			elapsedIntervalRef.current = null;
		}
	}, [teardownMicLevelMeter]);

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

		void Promise.all([stopOne(mainRecorder), stopOne(webcamRecorder)]).then(() => {
			const result = finalize(durationMs);
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
			screenStream = await navigator.mediaDevices.getDisplayMedia({
				video: { frameRate: 30 },
				audio: true,
			});
		} catch (err) {
			setError(describeGetUserMediaError(err));
			setPhase("error");
			return;
		}
		screenStreamRef.current = screenStream;

		const screenVideoTrack = screenStream.getVideoTracks()[0];
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
			screenMimeType ? { mimeType: screenMimeType } : undefined,
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
				webcamMimeType ? { mimeType: webcamMimeType } : undefined,
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
	}, [micEnabled, performStop, webcamEnabled]);

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
