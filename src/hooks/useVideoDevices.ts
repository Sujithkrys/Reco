import { useCallback, useEffect, useRef, useState } from "react";

export interface VideoDevice {
	deviceId: string;
	label: string;
	groupId: string;
}

function isPermissionDeniedError(err: unknown): boolean {
	return (
		err instanceof DOMException &&
		(err.name === "NotAllowedError" ||
			err.name === "PermissionDeniedError" ||
			err.name === "SecurityError")
	);
}

export function useVideoDevices(enabled: boolean = true) {
	const [devices, setDevices] = useState<VideoDevice[]>([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [permissionDenied, setPermissionDenied] = useState(false);
	const [retryToken, setRetryToken] = useState(0);
	// Per-hook-instance, not module-level: a probe that failed for one editor
	// session must not permanently block every later attempt for the same
	// user within the same page load.
	const hasProbedRef = useRef(false);

	const retry = useCallback(() => {
		hasProbedRef.current = false;
		setRetryToken((token) => token + 1);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryToken is a deliberate cache-buster for retry() and is never read inside the effect.
	useEffect(() => {
		if (!enabled) {
			return;
		}
		if (!navigator.mediaDevices?.enumerateDevices) {
			setError("This browser does not support camera access.");
			return;
		}

		let mounted = true;
		let activeLoadId = 0;

		const mapVideoInputs = (list: MediaDeviceInfo[]): VideoDevice[] =>
			list
				.filter((device) => device.kind === "videoinput")
				.map((device, index) => ({
					deviceId: device.deviceId,
					label: device.label || `Camera ${index + 1}`,
					groupId: device.groupId,
				}));

		const loadDevices = async () => {
			const loadId = ++activeLoadId;
			let permissionStream: MediaStream | null = null;

			try {
				if (mounted && loadId === activeLoadId) {
					setIsLoading(true);
					setError(null);
				}

				let allDevices = await navigator.mediaDevices.enumerateDevices();
				const rawVideoInputs = allDevices.filter((device) => device.kind === "videoinput");
				let videoInputs = mapVideoInputs(allDevices);

				// enumerateDevices() is not reliable evidence of "no camera" on its
				// own: for an origin with no prior permission decision, browsers
				// commonly return zero videoinput entries at all, or entries with
				// blank labels, even when real hardware is present — device
				// kind/count and labels can both be gated behind permission. Check
				// the *raw* label here, not the display fallback ("Camera 1") that
				// mapVideoInputs substitutes for a blank one — checking the
				// already-substituted label can never see a blank label, so this
				// probe would never fire.
				const needsProbe =
					!hasProbedRef.current &&
					(rawVideoInputs.length === 0 || rawVideoInputs.every((device) => !device.label.trim()));

				if (needsProbe) {
					hasProbedRef.current = true;
					try {
						permissionStream = await navigator.mediaDevices.getUserMedia({
							video: true,
							audio: false,
						});
						allDevices = await navigator.mediaDevices.enumerateDevices();
						videoInputs = mapVideoInputs(allDevices);
						if (mounted && loadId === activeLoadId) setPermissionDenied(false);
					} catch (probeError) {
						// The pre-probe list (if any) is unconfirmed placeholder data —
						// blank labels and possibly-empty deviceIds — that can't
						// actually be used to start a stream. Don't report it as real
						// once the probe has definitively failed, whatever the reason.
						videoInputs = [];
						if (mounted && loadId === activeLoadId) {
							// A real camera may still exist — the user just hasn't (or
							// has refused to have) granted this site access. That's a
							// different, fixable situation from no hardware existing
							// and needs its own message and a way to retry. Any other
							// failure (no device, unsupported in this context, etc.)
							// falls back to the plain "not detected" message.
							setPermissionDenied(isPermissionDeniedError(probeError));
						}
					}
				} else if (mounted && loadId === activeLoadId) {
					setPermissionDenied(false);
				}

				if (mounted && loadId === activeLoadId) {
					setDevices(videoInputs);
					setSelectedDeviceId((currentDeviceId) => {
						if (currentDeviceId === "default" && videoInputs.length > 0) {
							return videoInputs[0].deviceId;
						}

						if (
							currentDeviceId !== "default" &&
							videoInputs.some((device) => device.deviceId === currentDeviceId)
						) {
							return currentDeviceId;
						}

						return videoInputs[0]?.deviceId ?? "default";
					});
				}
			} catch (err) {
				if (mounted && loadId === activeLoadId) {
					const message =
						err instanceof Error ? err.message : "Failed to enumerate video devices";
					setError(message);
					console.error("Error loading video devices:", err);
				}
			} finally {
				permissionStream?.getTracks().forEach((track) => track.stop());
				if (mounted && loadId === activeLoadId) {
					setIsLoading(false);
				}
			}
		};

		void loadDevices();

		const handleDeviceChange = () => {
			void loadDevices();
		};
		navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

		// devicechange only fires for physical connect/disconnect, not for a
		// permission decision changing — e.g. the user allowing camera access
		// from the address-bar icon or chrome://settings while this dialog is
		// still open. The Permissions API lets us react to that directly
		// instead of requiring the user to close and reopen the dialog.
		let permissionStatus: PermissionStatus | null = null;
		const handlePermissionChange = () => {
			hasProbedRef.current = false;
			void loadDevices();
		};
		try {
			navigator.permissions
				?.query({ name: "camera" as PermissionName })
				.then((status) => {
					if (!mounted) return;
					permissionStatus = status;
					status.addEventListener("change", handlePermissionChange);
				})
				.catch(() => undefined);
		} catch {
			// Some browsers (e.g. Firefox) reject "camera" as an unrecognized
			// PermissionName synchronously rather than via promise rejection.
		}

		return () => {
			mounted = false;
			navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
			permissionStatus?.removeEventListener("change", handlePermissionChange);
		};
	}, [enabled, retryToken]);

	return {
		devices,
		selectedDeviceId,
		setSelectedDeviceId,
		isLoading,
		error,
		permissionDenied,
		retry,
	};
}
