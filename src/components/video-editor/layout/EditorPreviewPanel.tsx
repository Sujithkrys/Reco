import {
	BookmarkSimple,
	CaretDown,
	Check,
	Crop,
	MagicWand,
	MagnifyingGlassPlus,
	Pause,
	Play,
	Plus,
	Scissors,
	SkipBack,
	SkipForward,
	SpeakerHigh,
	SpeakerLow,
	SpeakerX,
	Waveform,
} from "@phosphor-icons/react";
import { useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useI18n } from "@/contexts/I18nContext";
import { ASPECT_RATIOS, type AspectRatio, getAspectRatioLabel } from "@/utils/aspectRatioUtils";
import type { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import type { CaptionEditTarget } from "../captionEditing";
import type { useAnnotationRegionCommands } from "../hooks/useAnnotationRegionCommands";
import type { useEditorPlaybackControls } from "../hooks/useEditorPlaybackControls";
import type { useTimelineProjection } from "../hooks/useTimelineProjection";
import type { useZoomRegionCommands } from "../hooks/useZoomRegionCommands";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { VideoPlaybackRef } from "../VideoPlayback";
import { ChapterManagementModal } from "../chapters/ChapterManagementModal";
import { rippleShiftChapters } from "../chapters/chapterUtils";
import { SilenceRemovalModal } from "../silenceRemoval/SilenceRemovalModal";
import { EditorVideoPreview } from "./EditorVideoPreview";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	videoPath: string | null;
	previewVersion: number;
	aspectRatio: AspectRatio;
	setAspectRatio: Dispatch<SetStateAction<AspectRatio>>;
	previewAspectRatioValue: number;
	videoPlaybackRef: RefObject<VideoPlaybackRef>;
	timelineRef: RefObject<TimelineEditorHandle>;
	currentTime: number;
	isPlaying: boolean;
	previewVolume: number;
	setPreviewVolume: Dispatch<SetStateAction<number>>;
	suspendRendering: boolean;
	appearance: ReturnType<typeof useAppearanceState>;
	timeline: ReturnType<typeof useTimelineState>;
	audio: ReturnType<typeof useVideoEditorAudio>;
	projection: ReturnType<typeof useTimelineProjection>;
	playback: ReturnType<typeof useEditorPlaybackControls>;
	zoomCommands: ReturnType<typeof useZoomRegionCommands>;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	effectiveCursorTelemetry: ReturnType<typeof useTimelineState>["cursorTelemetry"];
	effectiveShowCursor: boolean;
	isCropped: boolean;
	handleOpenCropEditor: () => void;
	handleSaveAutoCaptionEdit: (target: CaptionEditTarget, text: string) => void;
	handleSelectAnnotation: (id: string | null) => void;
	setDuration: Dispatch<SetStateAction<number>>;
	setIsPreviewReady: Dispatch<SetStateAction<boolean>>;
	setCurrentTime: Dispatch<SetStateAction<number>>;
	setIsPlaying: Dispatch<SetStateAction<boolean>>;
	setError: Dispatch<SetStateAction<string | null>>;
};

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function EditorPreviewPanel(props: Props) {
	const {
		t,
		videoPath,
		previewVersion,
		aspectRatio,
		setAspectRatio,
		previewAspectRatioValue,
		videoPlaybackRef,
		timelineRef,
		currentTime,
		isPlaying,
		previewVolume,
		setPreviewVolume,
		suspendRendering,
		appearance,
		timeline,
		audio,
		projection,
		playback,
		zoomCommands,
		annotationCommands,
		effectiveCursorTelemetry,
		effectiveShowCursor,
		isCropped,
		handleOpenCropEditor,
		handleSaveAutoCaptionEdit,
		handleSelectAnnotation,
		setDuration,
		setIsPreviewReady,
		setCurrentTime,
		setIsPlaying,
		setError,
	} = props;

	const [silenceModalOpen, setSilenceModalOpen] = useState(false);
	const [chapterModalOpen, setChapterModalOpen] = useState(false);

	const activeChapter = useMemo(() => {
		const currentMs = projection.timelinePlayheadTime * 1000;
		if (!timeline.chapters || timeline.chapters.length === 0) return null;
		const sorted = [...timeline.chapters].sort((a, b) => a.timeMs - b.timeMs);
		let match = null;
		for (const ch of sorted) {
			if (ch.timeMs <= currentMs) {
				match = ch;
			} else {
				break;
			}
		}
		return match;
	}, [projection.timelinePlayheadTime, timeline.chapters]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					<div className="flex flex-shrink-0 items-center justify-center gap-2 py-1.5">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 gap-1 px-2 text-xs text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
								>
									<span className="font-medium">
										{getAspectRatioLabel(aspectRatio)}
									</span>
									<CaretDown className="h-3 w-3" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="center"
								className="border-foreground/10 bg-editor-surface-alt"
							>
								{ASPECT_RATIOS.map((ratio) => (
									<DropdownMenuItem
										key={ratio}
										onClick={() => setAspectRatio(ratio)}
										className="flex cursor-pointer items-center justify-between gap-3 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
									>
										<span>{getAspectRatioLabel(ratio)}</span>
										{aspectRatio === ratio ? (
											<Check className="h-3 w-3 text-[#2563EB]" />
										) : null}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<div className="h-4 w-px bg-foreground/20" />
						<Button
							variant="ghost"
							size="sm"
							onClick={handleOpenCropEditor}
							className="h-7 gap-1.5 px-2 text-xs text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
						>
							<Crop className="h-3.5 w-3.5" />
							<span className="font-medium">{t("settings.crop.title")}</span>
							{isCropped ? (
								<span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
							) : null}
						</Button>
					</div>
					<div
						className="flex min-h-0 w-full flex-1 items-stretch"
						style={{ flex: "1 1 auto", margin: "6px 0 0" }}
					>
						<div className="flex min-w-0 flex-1 items-center justify-center px-1">
							<div
								className="relative"
								style={{
									width: "auto",
									height: "100%",
									aspectRatio: previewAspectRatioValue,
									maxWidth: "100%",
									margin: "0 auto",
									boxSizing: "border-box",
								}}
							>
								<EditorVideoPreview
									videoPath={videoPath}
									previewVersion={previewVersion}
									aspectRatio={aspectRatio}
									playbackRef={videoPlaybackRef}
									currentTime={currentTime}
									isPlaying={isPlaying}
									previewVolume={previewVolume}
									suspendRendering={suspendRendering}
									appearance={appearance}
									timeline={timeline}
									audio={audio}
									effectiveZoomRegions={projection.effectiveZoomRegions}
									effectiveCursorTelemetry={effectiveCursorTelemetry}
									effectiveShowCursor={effectiveShowCursor}
									setDuration={setDuration}
									setIsPreviewReady={setIsPreviewReady}
									setCurrentTime={setCurrentTime}
									setIsPlaying={setIsPlaying}
									setError={setError}
									handlers={{
										onSelectZoom: zoomCommands.handleSelectZoom,
										onZoomFocusChange: zoomCommands.handleZoomFocusChange,
										onEditAutoCaption: handleSaveAutoCaptionEdit,
										onSelectAnnotation: handleSelectAnnotation,
										onAnnotationPositionChange:
											annotationCommands.handleAnnotationPositionChange,
										onAnnotationSizeChange:
											annotationCommands.handleAnnotationSizeChange,
									}}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="relative flex flex-shrink-0 items-center px-1 py-1">
				<div className="z-10 flex min-w-0 flex-1 items-center gap-1.5">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1 rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-2.5 text-[11px] text-foreground/65 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)] transition-all hover:bg-foreground/[0.08] hover:text-foreground"
							>
								<Plus className="h-3.5 w-3.5" />
								<span className="font-medium">{t("editor.toolbar.addLayer")}</span>
								<CaretDown className="h-3 w-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="border-foreground/10 bg-editor-surface-alt"
						>
							{(
								[
									{ type: "text", label: "Text" },
									{ type: "image", label: "Image" },
									{ type: "shape", label: "Shape" },
								] as const
							).map((option) => (
								<DropdownMenuItem
									key={option.type}
									onClick={() => {
										const nextTrack =
											timeline.annotationRegions.length > 0
												? Math.max(
														...timeline.annotationRegions.map(
															(region) => region.trackIndex ?? 0,
														),
													) + 1
												: 0;
										timelineRef.current?.addAnnotation(nextTrack, option.type);
									}}
									className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
								>
									{option.label}
								</DropdownMenuItem>
							))}
							<DropdownMenuItem
								key="audio"
								onClick={() => {
									timelineRef.current?.addAudio();
								}}
								className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								Audio
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<div className="mx-1 h-4 w-px bg-foreground/10" />
					<Tooltip content={t("timeline.zoom.addZoom")} asChild>
						<Button
							onClick={() => timelineRef.current?.addZoom()}
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-[#2563EB]/10 hover:text-[#2563EB]"
							aria-label={t("timeline.zoom.addZoom")}
						>
							<MagnifyingGlassPlus className="h-4 w-4" />
						</Button>
					</Tooltip>
					<Tooltip content={t("timeline.zoom.suggestZooms")} asChild>
						<Button
							onClick={() => timelineRef.current?.suggestZooms()}
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-[#2563EB]/10 hover:text-[#2563EB]"
							aria-label={t("timeline.zoom.suggestZooms")}
						>
							<MagicWand className="h-4 w-4" />
						</Button>
					</Tooltip>
					<Tooltip content={t("editor.toolbar.splitClip")} asChild>
						<Button
							onClick={() => timelineRef.current?.splitClip()}
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
							aria-label={t("editor.toolbar.splitClip")}
						>
							<Scissors className="h-4 w-4" />
						</Button>
					</Tooltip>
					<Tooltip content="Smart Cut / Silence Removal" asChild>
						<Button
							onClick={() => setSilenceModalOpen(true)}
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-emerald-500/10 hover:text-emerald-500"
							aria-label="Smart Cut / Silence Removal"
						>
							<Waveform className="h-4 w-4" />
						</Button>
					</Tooltip>
					<Tooltip
						content={
							timeline.chapters && timeline.chapters.length > 0
								? `Video Chapters (${timeline.chapters.length})`
								: "Video Chapters"
						}
						asChild
					>
						<Button
							onClick={() => setChapterModalOpen(true)}
							variant="ghost"
							size="icon"
							className={`h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-amber-500/10 hover:text-amber-400 ${
								timeline.chapters && timeline.chapters.length > 0 ? "text-amber-400" : ""
							}`}
							aria-label={
								timeline.chapters && timeline.chapters.length > 0
									? `Video Chapters (${timeline.chapters.length})`
									: "Video Chapters"
							}
						>
							<BookmarkSimple
								className="h-4 w-4"
								weight={timeline.chapters && timeline.chapters.length > 0 ? "fill" : "regular"}
							/>
						</Button>
					</Tooltip>
				</div>

				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
					<div className="pointer-events-auto flex items-center gap-1.5">
						<span className="mr-1 text-[10px] font-medium tabular-nums text-muted-foreground flex items-center gap-1.5">
							<span>{formatTime(projection.timelinePlayheadTime)}</span>
							{activeChapter && (
								<span className="hidden sm:inline-block max-w-[120px] truncate text-amber-400 font-medium">
									• {activeChapter.title}
								</span>
							)}
						</span>
						<Tooltip content={t("editor.playback.skipBack")} asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
								aria-label={t("editor.playback.skipBack")}
								onClick={playback.handlePreviewSkipBack}
							>
								<SkipBack className="h-3.5 w-3.5" weight="fill" />
							</Button>
						</Tooltip>
						<Tooltip content={isPlaying ? "Pause" : "Play"} asChild>
							<Button
								variant="ghost"
								size="icon"
								className={`h-7 w-7 rounded-full border border-foreground/10 shadow-[0_8px_18px_rgba(0,0,0,0.18)] transition-all ${isPlaying ? "bg-foreground/10 text-foreground hover:bg-foreground/20" : "bg-neutral-800 text-white hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-white/90"}`}
								onClick={playback.togglePlayPause}
								aria-label={isPlaying ? "Pause" : "Play"}
							>
								{isPlaying ? (
									<Pause className="h-3.5 w-3.5" weight="fill" />
								) : (
									<Play className="h-3.5 w-3.5" weight="fill" />
								)}
							</Button>
						</Tooltip>
						<Tooltip content={t("editor.playback.skipForward")} asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
								aria-label={t("editor.playback.skipForward")}
								onClick={playback.handlePreviewSkipForward}
							>
								<SkipForward className="h-3.5 w-3.5" weight="fill" />
							</Button>
						</Tooltip>
						<span className="ml-1 text-[10px] font-medium tabular-nums text-muted-foreground/70">
							{formatTime(projection.timelineDuration)}
						</span>
					</div>
				</div>

				<div className="z-10 ml-auto flex items-center gap-2">
					<div className="flex items-center gap-1.5">
						<Tooltip content={t("editor.playback.muteUnmute")} asChild>
							<button
								type="button"
								className="text-muted-foreground transition-colors hover:text-foreground"
								aria-label={t("editor.playback.muteUnmute")}
								onClick={() => setPreviewVolume(previewVolume <= 0.001 ? 1 : 0)}
							>
								{previewVolume <= 0.001 ? (
									<SpeakerX className="h-3.5 w-3.5" />
								) : previewVolume < 0.5 ? (
									<SpeakerLow className="h-3.5 w-3.5" />
								) : (
									<SpeakerHigh className="h-3.5 w-3.5" />
								)}
							</button>
						</Tooltip>
						<div className="relative flex h-7 w-24 select-none items-center overflow-hidden rounded-full border border-foreground/[0.06] bg-editor-bg/80 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)]">
							<div
								className="absolute inset-y-[3px] left-[3px] right-auto rounded-[10px] bg-foreground/[0.08]"
								style={{
									width:
										previewVolume > 0
											? `max(calc(${previewVolume * 100}% - 6px), 1.2rem)`
											: 0,
								}}
							/>
							<div
								className="pointer-events-none absolute bottom-[18%] top-[18%] z-10 w-0.5 rounded-full bg-foreground/95 shadow-[0_0_10px_rgba(37,99,235,0.28)]"
								style={{ left: `calc(${previewVolume * 100}% - 8px)` }}
							/>
							<span className="pointer-events-none relative z-10 pl-2 text-[10px] font-medium text-muted-foreground">
								{Math.round(previewVolume * 100)}%
							</span>
							<input
								type="range"
								aria-label={t("editor.playback.volume", "Preview volume")}
								min="0"
								max="1"
								step="0.01"
								value={previewVolume}
								onChange={(event) => setPreviewVolume(Number(event.target.value))}
								className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
							/>
						</div>
					</div>
				</div>
			</div>
			<SilenceRemovalModal
				open={silenceModalOpen}
				onOpenChange={setSilenceModalOpen}
				videoPath={videoPath}
				totalDurationMs={projection.timelineDuration * 1000}
				clipRegions={timeline.clipRegions}
				zoomRegions={timeline.zoomRegions}
				annotationRegions={timeline.annotationRegions}
				audioRegions={timeline.audioRegions}
				captionCues={timeline.autoCaptions}
				onApplyPlan={(plan, cuts) => {
					timeline.setClipRegions(plan.newClipRegions);
					timeline.setZoomRegions(plan.newZoomRegions);
					timeline.setAnnotationRegions(plan.newAnnotationRegions);
					timeline.setAudioRegions(plan.newAudioRegions);
					if (plan.newCaptionCues && plan.newCaptionCues.length > 0) {
						timeline.setAutoCaptions(plan.newCaptionCues);
					}
					if (timeline.chapters && timeline.chapters.length > 0 && cuts.length > 0) {
						timeline.setChapters(
							rippleShiftChapters(
								timeline.chapters,
								cuts,
								projection.timelineDuration * 1000,
							),
						);
					}
				}}
			/>
			<ChapterManagementModal
				open={chapterModalOpen}
				onOpenChange={setChapterModalOpen}
				chapters={timeline.chapters ?? []}
				onSaveChapters={timeline.setChapters}
				currentTimeMs={projection.timelinePlayheadTime * 1000}
				onSeek={playback.handleTimelineSeek}
				videoPath={videoPath}
				transcript={timeline.autoCaptions}
			/>
		</div>
	);
}
