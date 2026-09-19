import * as Dialog from "@radix-ui/react-dialog";
import { Microphone, Record, VideoCamera, X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { UseNativeScreenRecording } from "@/hooks/useNativeScreenRecording";
import type { WebcamOverlaySettings } from "../types";

type RecordingLauncherDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	recorder: UseNativeScreenRecording;
	webcamSettings: WebcamOverlaySettings;
	onStart: () => void;
};

export function RecordingLauncherDialog({
	open,
	onOpenChange,
	recorder,
	webcamSettings,
	onStart,
}: RecordingLauncherDialogProps) {
	const previewRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (previewRef.current) {
			previewRef.current.srcObject = recorder.webcamStream;
		}
	}, [recorder.webcamStream]);

	const starting = recorder.phase === "starting";

	return (
		<Dialog.Root open={open} onOpenChange={(next) => !starting && onOpenChange(next)}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
				<Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-[10px] bg-editor-dialog p-6 text-foreground shadow-2xl focus:outline-none">
					<div className="flex items-center justify-between">
						<Dialog.Title className="text-lg font-semibold tracking-tight">
							Record your screen
						</Dialog.Title>
						<Dialog.Close
							className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none disabled:opacity-30"
							disabled={starting}
						>
							<X className="h-4 w-4" />
						</Dialog.Close>
					</div>
					<Dialog.Description className="mt-1.5 text-sm text-foreground/60">
						Your browser will ask you to choose a screen, window, or tab to share.
					</Dialog.Description>
					<p className="mt-2 rounded-md bg-foreground/[0.04] px-3 py-2 text-[11px] leading-relaxed text-foreground/60">
						Cursor style, click effects, and sway only work for recordings where
						you share <span className="font-medium text-foreground/80">this tab</span> —
						browsers can't see your cursor over other windows or the desktop.
					</p>

					<div className="mt-5 flex flex-col gap-3">
						{/* Webcam toggle */}
						<div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-3">
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-2">
									<VideoCamera className="h-4 w-4 text-foreground/70" />
									<span className="text-sm font-medium">Webcam</span>
								</div>
								<Switch
									checked={recorder.webcamEnabled}
									onCheckedChange={recorder.setWebcamEnabled}
									disabled={starting || recorder.videoDevices.devices.length === 0}
									aria-label="Enable webcam"
								/>
							</div>
							{recorder.videoDevices.devices.length === 0 ? (
								<p className="mt-2 text-xs text-amber-500/90">
									No camera was detected on this device.
								</p>
							) : null}
							{recorder.webcamError ? (
								<p className="mt-2 text-xs text-red-400">{recorder.webcamError}</p>
							) : null}
							{recorder.webcamEnabled && recorder.webcamStream ? (
								<div className="mt-3 flex justify-center">
									<video
										ref={previewRef}
										autoPlay
										muted
										playsInline
										className="h-28 w-28 rounded-full border border-foreground/10 object-cover"
										style={{
											transform: webcamSettings.mirror ? "scaleX(-1)" : undefined,
										}}
									/>
								</div>
							) : null}
						</div>

						{/* Mic toggle */}
						<div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-3">
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-2">
									<Microphone className="h-4 w-4 text-foreground/70" />
									<span className="text-sm font-medium">Microphone</span>
								</div>
								<Switch
									checked={recorder.micEnabled}
									onCheckedChange={recorder.setMicEnabled}
									disabled={starting || recorder.micDevices.devices.length === 0}
									aria-label="Enable microphone"
								/>
							</div>
							{recorder.micDevices.devices.length === 0 ? (
								<p className="mt-2 text-xs text-amber-500/90">
									No microphone was detected on this device.
								</p>
							) : null}
							{recorder.micError ? (
								<p className="mt-2 text-xs text-red-400">{recorder.micError}</p>
							) : null}
							{recorder.micEnabled ? (
								<div className="mt-3">
									<div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
										<div
											className="h-full rounded-full bg-emerald-500 transition-[width] duration-100"
											style={{ width: `${Math.min(100, recorder.micLevel)}%` }}
										/>
									</div>
									<p className="mt-1.5 text-[11px] text-foreground/50">
										Speak to confirm your mic is picking up sound.
									</p>
								</div>
							) : null}
						</div>

						{recorder.error ? (
							<p className="text-xs text-red-400">{recorder.error}</p>
						) : null}

						<Button
							type="button"
							onClick={onStart}
							disabled={starting || !recorder.isSupported}
							className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] text-sm font-semibold text-white hover:bg-[#2563EB]/90 disabled:opacity-60"
						>
							<Record className="h-4 w-4" weight="fill" />
							{starting ? "Waiting for share…" : "Start Recording"}
						</Button>
						{!recorder.isSupported ? (
							<p className="text-center text-xs text-foreground/50">
								Screen recording isn't supported in this browser.
							</p>
						) : null}
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
