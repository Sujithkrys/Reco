import {
	Clock,
	Info,
	Scissors,
	Sparkle,
	Warning,
} from "@phosphor-icons/react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type {
	AnnotationRegion,
	AudioRegion,
	CaptionCue,
	ClipRegion,
	ZoomRegion,
} from "../types";
import { getDecodedAudioBuffer, getMonoChannelData } from "./audioBufferUtils";
import {
	DEFAULT_SILENCE_OPTIONS,
	detectSilenceIntervals,
	type SilenceInterval,
} from "./detectSilenceIntervals";
import { planSilenceRemoval, type SilenceRemovalPlan } from "./planSilenceRemoval";

interface SilenceRemovalModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	videoPath: string | null;
	totalDurationMs: number;
	clipRegions: ClipRegion[];
	zoomRegions: ZoomRegion[];
	annotationRegions: AnnotationRegion[];
	audioRegions: AudioRegion[];
	captionCues?: CaptionCue[];
	onApplyPlan: (plan: SilenceRemovalPlan, cuts: SilenceInterval[]) => void;
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes === 0) {
		return `${seconds}s`;
	}
	return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function SilenceRemovalModal({
	open,
	onOpenChange,
	videoPath,
	totalDurationMs,
	clipRegions,
	zoomRegions,
	annotationRegions,
	audioRegions,
	captionCues = [],
	onApplyPlan,
}: SilenceRemovalModalProps) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pcmData, setPcmData] = useState<{ samples: Float32Array; sampleRate: number } | null>(
		null,
	);

	// User adjustable parameters
	const [thresholdDb, setThresholdDb] = useState(DEFAULT_SILENCE_OPTIONS.thresholdDb);
	const [minDurationMs, setMinDurationMs] = useState(DEFAULT_SILENCE_OPTIONS.minDurationMs);
	const [speechPaddingMs, setSpeechPaddingMs] = useState(DEFAULT_SILENCE_OPTIONS.speechPaddingMs);
	const [preserveContinuousAudio, setPreserveContinuousAudio] = useState(true);

	// Decode audio on open
	useEffect(() => {
		if (!open || !videoPath) {
			setPcmData(null);
			setError(null);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		getDecodedAudioBuffer(videoPath)
			.then((buffer) => {
				if (cancelled) return;
				const samples = getMonoChannelData(buffer);
				setPcmData({ samples, sampleRate: buffer.sampleRate });
				setLoading(false);
			})
			.catch((err) => {
				if (cancelled) return;
				console.error("[SilenceRemovalModal] Audio decode error:", err);
				setError(
					"Could not extract audio from this video. Please ensure the file has a valid audio track.",
				);
				setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [open, videoPath]);

	// Detect silence intervals whenever parameters or pcm data change
	const detectedSilences: SilenceInterval[] = useMemo(() => {
		if (!pcmData) return [];
		return detectSilenceIntervals(pcmData.samples, pcmData.sampleRate, {
			thresholdDb,
			minDurationMs,
			speechPaddingMs,
		});
	}, [pcmData, thresholdDb, minDurationMs, speechPaddingMs]);

	// Generate the planned changes and impact audit
	const plan: SilenceRemovalPlan = useMemo(() => {
		return planSilenceRemoval({
			clipRegions,
			zoomRegions,
			annotationRegions,
			audioRegions,
			captionCues,
			silenceIntervals: detectedSilences,
			totalDurationMs,
			preserveContinuousAudio,
		});
	}, [
		clipRegions,
		zoomRegions,
		annotationRegions,
		audioRegions,
		captionCues,
		detectedSilences,
		totalDurationMs,
		preserveContinuousAudio,
	]);

	const { impact } = plan;

	const handleApply = () => {
		if (detectedSilences.length === 0) return;
		onApplyPlan(plan, detectedSilences);
		toast.success(
			`Removed ${impact.silenceCount} silent pauses (saved ${formatDuration(impact.timeSavedMs)})`,
		);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-editor-panel border-foreground/10 text-foreground p-6 shadow-2xl rounded-2xl">
				<DialogHeader className="space-y-1">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
							<Scissors className="h-4 w-4" weight="bold" />
						</div>
						<DialogTitle className="text-lg font-semibold">Smart Cut & Silence Removal</DialogTitle>
					</div>
					<DialogDescription className="text-xs text-muted-foreground">
						Automatically detects pauses and dead air in your recording and ripples the timeline
						together.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-12 flex flex-col items-center justify-center gap-3">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
						<p className="text-sm text-muted-foreground animate-pulse">Analyzing audio track...</p>
					</div>
				) : error ? (
					<div className="py-6 flex items-start gap-3 rounded-xl bg-red-500/10 p-4 text-red-400 text-sm">
						<Warning className="h-5 w-5 shrink-0 mt-0.5" />
						<div>{error}</div>
					</div>
				) : (
					<div className="space-y-5 py-2">
						{/* Summary Stats Cards */}
						<div className="grid grid-cols-3 gap-3">
							<div className="rounded-xl border border-foreground/10 bg-foreground/5 p-3 text-center">
								<div className="text-xs text-muted-foreground">Pauses Detected</div>
								<div className="text-xl font-bold text-foreground mt-0.5">
									{impact.silenceCount}
								</div>
							</div>
							<div className="rounded-xl border border-foreground/10 bg-foreground/5 p-3 text-center">
								<div className="text-xs text-muted-foreground">Time Saved</div>
								<div className="text-xl font-bold text-emerald-400 mt-0.5">
									{formatDuration(impact.timeSavedMs)}
								</div>
							</div>
							<div className="rounded-xl border border-foreground/10 bg-foreground/5 p-3 text-center">
								<div className="text-xs text-muted-foreground">New Duration</div>
								<div className="text-xl font-bold text-foreground mt-0.5">
									{formatDuration(impact.newTotalDurationMs)}
								</div>
							</div>
						</div>

						{/* Explicit Content Deletion Warning Callout */}
						{(impact.removedZoomCount > 0 || impact.removedAnnotationCount > 0) && (
							<div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-200/90 flex gap-3">
								<Warning className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" weight="fill" />
								<div className="space-y-1">
									<div className="font-semibold text-amber-300">
										Content Removal Disclosure
									</div>
									<p>
										Executing this cut will remove{" "}
										{impact.removedZoomCount > 0 && (
											<span className="font-semibold text-white">
												{impact.removedZoomCount} zoom region
												{impact.removedZoomCount === 1 ? "" : "s"}
											</span>
										)}
										{impact.removedZoomCount > 0 && impact.removedAnnotationCount > 0 && " and "}
										{impact.removedAnnotationCount > 0 && (
											<span className="font-semibold text-white">
												{impact.removedAnnotationCount} annotation
												{impact.removedAnnotationCount === 1 ? "" : "s"}
											</span>
										)}{" "}
										that fall completely inside the silent sections being excised.
									</p>
									{impact.removedAnnotationDescriptions.length > 0 && (
										<div className="text-[11px] text-amber-300/80 italic pt-1">
											Affected: {impact.removedAnnotationDescriptions.join(", ")}
										</div>
									)}
								</div>
							</div>
						)}

						{/* Tuning Controls */}
						<div className="space-y-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
							{/* Threshold Slider */}
							<div className="space-y-2">
								<div className="flex justify-between items-center text-xs">
									<Label className="font-medium text-foreground">Silence Threshold</Label>
									<span className="font-mono text-muted-foreground">{thresholdDb} dB</span>
								</div>
								<Slider
									min={-55}
									max={-20}
									step={1}
									value={[thresholdDb]}
									onValueChange={([val]) => setThresholdDb(val)}
									className="cursor-pointer"
								/>
								<div className="flex justify-between text-[10px] text-muted-foreground/60">
									<span>-55 dB (Strict silence only)</span>
									<span>-20 dB (Aggressive)</span>
								</div>
							</div>

							{/* Min Duration Slider */}
							<div className="space-y-2">
								<div className="flex justify-between items-center text-xs">
									<Label className="font-medium text-foreground">Minimum Pause Duration</Label>
									<span className="font-mono text-muted-foreground">{minDurationMs} ms</span>
								</div>
								<Slider
									min={200}
									max={1500}
									step={50}
									value={[minDurationMs]}
									onValueChange={([val]) => setMinDurationMs(val)}
									className="cursor-pointer"
								/>
								<div className="flex justify-between text-[10px] text-muted-foreground/60">
									<span>200 ms (Fast cuts)</span>
									<span>1500 ms (Only long pauses)</span>
								</div>
							</div>

							{/* Speech Padding Slider */}
							<div className="space-y-2">
								<div className="flex justify-between items-center text-xs">
									<Label className="font-medium text-foreground">Speech Cushion / Padding</Label>
									<span className="font-mono text-muted-foreground">{speechPaddingMs} ms</span>
								</div>
								<Slider
									min={50}
									max={250}
									step={25}
									value={[speechPaddingMs]}
									onValueChange={([val]) => setSpeechPaddingMs(val)}
									className="cursor-pointer"
								/>
								<div className="flex justify-between text-[10px] text-muted-foreground/60">
									<span>50 ms (Tight cuts)</span>
									<span>250 ms (Natural breathing room)</span>
								</div>
							</div>

							{/* Continuous Background Music Switch */}
							{audioRegions.length > 0 && (
								<div className="flex items-center justify-between pt-2 border-t border-foreground/10">
									<div className="space-y-0.5">
										<Label className="text-xs font-medium text-foreground">
											Keep background music continuous
										</Label>
										<p className="text-[10px] text-muted-foreground">
											Prevents music tracks from being chopped into disjointed fragments.
										</p>
									</div>
									<Switch
										checked={preserveContinuousAudio}
										onCheckedChange={setPreserveContinuousAudio}
									/>
								</div>
							)}
						</div>
					</div>
				)}

				<DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-foreground/10">
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						Cancel
					</Button>
					<Button
						disabled={loading || Boolean(error) || detectedSilences.length === 0}
						onClick={handleApply}
						className="gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4"
					>
						<Scissors className="h-3.5 w-3.5" weight="bold" />
						Apply Smart Cut ({detectedSilences.length})
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
