import { Stop } from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { UseNativeScreenRecording } from "@/hooks/useNativeScreenRecording";
import type { WebcamOverlaySettings } from "../types";

type RecordingIndicatorProps = {
	recorder: UseNativeScreenRecording;
	webcamSettings: WebcamOverlaySettings;
	onStop: () => void;
};

function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

const CORNER_STYLE: Record<WebcamOverlaySettings["corner"], CSSProperties> = {
	"top-left": { top: 88, left: 16 },
	"top-right": { top: 88, right: 16 },
	"bottom-left": { bottom: 16, left: 16 },
	"bottom-right": { bottom: 16, right: 16 },
};

export function RecordingIndicator({ recorder, webcamSettings, onStop }: RecordingIndicatorProps) {
	const bubbleVideoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (bubbleVideoRef.current) {
			bubbleVideoRef.current.srcObject = recorder.webcamStream;
		}
	}, [recorder.webcamStream]);

	if (recorder.phase !== "recording") return null;

	const bubbleSizePx = Math.max(96, Math.min(220, webcamSettings.width || webcamSettings.size));
	const cornerStyle = CORNER_STYLE[webcamSettings.corner] ?? CORNER_STYLE["bottom-right"];

	return (
		<>
			<div className="pointer-events-auto fixed left-1/2 top-3 z-[60] -translate-x-1/2">
				<div className="flex items-center gap-3 rounded-full border border-foreground/10 bg-editor-surface/95 px-3 py-1.5 shadow-2xl backdrop-blur">
					<span className="relative flex h-2.5 w-2.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
						<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
					</span>
					<span className="text-xs font-semibold tabular-nums text-foreground">
						{formatElapsed(recorder.elapsedMs)}
					</span>
					<Button
						type="button"
						size="sm"
						onClick={onStop}
						className="h-6 gap-1 rounded-full bg-red-500/10 px-2.5 text-[11px] font-semibold text-red-400 hover:bg-red-500/20"
					>
						<Stop className="h-3 w-3" weight="fill" />
						Stop
					</Button>
				</div>
			</div>
			{recorder.webcamEnabled && recorder.webcamStream ? (
				<div
					className="pointer-events-none fixed z-[60] overflow-hidden rounded-full border-2 border-white/80 shadow-2xl"
					style={{ ...cornerStyle, width: bubbleSizePx, height: bubbleSizePx }}
				>
					<video
						ref={bubbleVideoRef}
						autoPlay
						muted
						playsInline
						className="h-full w-full object-cover"
						style={{ transform: webcamSettings.mirror ? "scaleX(-1)" : undefined }}
					/>
				</div>
			) : null}
		</>
	);
}
