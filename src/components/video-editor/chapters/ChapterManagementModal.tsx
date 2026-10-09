import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	BookmarkSimple,
	Clock,
	Copy,
	Play,
	Plus,
	Sparkle,
	Trash,
} from "@phosphor-icons/react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ChapterMarker } from "./chapterTypes";
import {
	formatChapterTimestamp,
	formatYouTubeChapters,
	sanitizeChapterMarkers,
} from "./chapterUtils";
import { generateAutoChapters } from "./chaptersService";

interface ChapterManagementModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	chapters: ChapterMarker[];
	onSaveChapters: (chapters: ChapterMarker[]) => void;
	currentTimeMs: number;
	onSeek?: (seconds: number) => void;
	videoPath?: string | null;
	transcript?: Array<{ startMs: number; endMs: number; text: string }>;
}

export const ChapterManagementModal: React.FC<ChapterManagementModalProps> = ({
	open,
	onOpenChange,
	chapters,
	onSaveChapters,
	currentTimeMs,
	onSeek,
	videoPath,
	transcript,
}) => {
	const [localChapters, setLocalChapters] = useState<ChapterMarker[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Sync local copy whenever modal opens or chapters change externally
	useEffect(() => {
		if (open) {
			setLocalChapters([...chapters]);
			setError(null);
		}
	}, [open, chapters]);

	const handleAddChapterAtPlayhead = () => {
		const targetMs = localChapters.length === 0 ? 0 : Math.max(0, Math.round(currentTimeMs));
		const newChapter: ChapterMarker = {
			id: crypto.randomUUID(),
			timeMs: targetMs,
			title: `Chapter ${localChapters.length + 1}`,
		};

		const updated = sanitizeChapterMarkers([...localChapters, newChapter]);
		setLocalChapters(updated);
		toast.success(`Added chapter at ${formatChapterTimestamp(targetMs)}`);
	};

	const handleUpdateTitle = (id: string, newTitle: string) => {
		setLocalChapters((prev) =>
			prev.map((ch) => (ch.id === id ? { ...ch, title: newTitle } : ch)),
		);
	};

	const handleUpdateTime = (id: string, timeString: string) => {
		// Parse mm:ss or hh:mm:ss
		const parts = timeString.split(":").map((p) => Number.parseInt(p.trim(), 10));
		let parsedMs = 0;
		if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
			parsedMs = (parts[0] * 60 + parts[1]) * 1000;
		} else if (
			parts.length === 3 &&
			!Number.isNaN(parts[0]) &&
			!Number.isNaN(parts[1]) &&
			!Number.isNaN(parts[2])
		) {
			parsedMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
		} else {
			return; // Invalid time format, don't update yet
		}

		setLocalChapters((prev) =>
			sanitizeChapterMarkers(
				prev.map((ch) => (ch.id === id ? { ...ch, timeMs: parsedMs } : ch)),
			),
		);
	};

	const handleDeleteChapter = (id: string) => {
		const filtered = localChapters.filter((ch) => ch.id !== id);
		setLocalChapters(sanitizeChapterMarkers(filtered));
	};

	const handleGenerateAI = async () => {
		setIsGenerating(true);
		setError(null);

		try {
			const res = await generateAutoChapters({
				transcript,
				videoPath,
			});

			if (!res.success || !res.chapters) {
				throw new Error(res.error || "Failed to generate chapter markers.");
			}

			setLocalChapters(res.chapters);
			toast.success(`Generated ${res.chapters.length} chapter markers!`);
		} catch (err: any) {
			const msg = err.message || "Failed to generate chapter markers.";
			setError(msg);
			toast.error(msg);
		} finally {
			setIsGenerating(false);
		}
	};

	const handleCopyForYouTube = async () => {
		if (localChapters.length === 0) {
			toast.error("No chapters to export");
			return;
		}

		const formatted = formatYouTubeChapters(localChapters);
		try {
			await navigator.clipboard.writeText(formatted);
			toast.success("Copied chapter timestamps to clipboard for YouTube!");
		} catch {
			toast.error("Failed to copy to clipboard");
		}
	};

	const handleSave = () => {
		const sanitized = sanitizeChapterMarkers(localChapters);
		onSaveChapters(sanitized);
		toast.success(`Saved ${sanitized.length} chapter markers`);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-editor-panel border-foreground/10 text-foreground p-6 shadow-2xl rounded-2xl">
				<DialogHeader className="space-y-1">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
							<BookmarkSimple className="h-4 w-4" weight="fill" />
						</div>
						<DialogTitle className="text-lg font-semibold">Video Chapter Markers</DialogTitle>
					</div>
					<DialogDescription className="text-xs text-muted-foreground">
						Organize your timeline with chapters for video navigation, timeline flags, and YouTube descriptions.
					</DialogDescription>
				</DialogHeader>

				{/* Action Toolbar */}
				<div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-b border-foreground/10 pb-4">
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={handleGenerateAI}
							disabled={isGenerating}
							className="h-8 gap-1.5 text-xs border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
						>
							<Sparkle className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} weight="fill" />
							{isGenerating ? "Analyzing..." : "Generate with AI"}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={handleAddChapterAtPlayhead}
							className="h-8 gap-1.5 text-xs border-foreground/15 hover:bg-foreground/10"
						>
							<Plus className="h-3.5 w-3.5" />
							Add at Playhead ({formatChapterTimestamp(currentTimeMs)})
						</Button>
					</div>

					<Button
						variant="ghost"
						size="sm"
						onClick={handleCopyForYouTube}
						disabled={localChapters.length === 0}
						className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
						title="Copy formatted 00:00 list to clipboard"
					>
						<Copy className="h-3.5 w-3.5" />
						Copy for YouTube
					</Button>
				</div>

				{/* Error Notice */}
				{error && (
					<div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
						{error}
					</div>
				)}

				{/* Chapters List */}
				<div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 py-1">
					{localChapters.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
							<Clock className="h-8 w-8 mb-2 opacity-40" />
							<p className="text-sm font-medium">No chapters yet</p>
							<p className="text-xs max-w-sm mt-1 opacity-75">
								Click &quot;Generate with AI&quot; to automatically detect topic segments, or add chapters manually at playhead positions.
							</p>
						</div>
					) : (
						localChapters.map((ch, idx) => (
							<div
								key={ch.id}
								className="flex items-center gap-2.5 p-2 rounded-xl border border-foreground/5 bg-foreground/[0.02] hover:bg-foreground/[0.04] transition-colors"
							>
								{/* Timestamp Button / Pill */}
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10"
										onClick={() => onSeek?.(ch.timeMs / 1000)}
										title="Jump playhead to this chapter"
									>
										<Play className="h-3 w-3" weight="fill" />
									</Button>
									<span className="font-mono text-xs font-semibold px-2 py-1 rounded bg-foreground/10 text-amber-400 select-all">
										{formatChapterTimestamp(ch.timeMs)}
									</span>
								</div>

								{/* Chapter Title Input */}
								<div className="flex-1">
									<Input
										value={ch.title}
										onChange={(e) => handleUpdateTitle(ch.id, e.target.value)}
										placeholder={`Chapter ${idx + 1}`}
										className="h-8 text-xs bg-background/50 border-foreground/10 focus-visible:ring-amber-400/50"
									/>
								</div>

								{/* Delete Button */}
								<Button
									variant="ghost"
									size="icon"
									onClick={() => handleDeleteChapter(ch.id)}
									className="h-7 w-7 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
									title="Remove chapter"
								>
									<Trash className="h-3.5 w-3.5" />
								</Button>
							</div>
						))
					)}
				</div>

				{/* Modal Footer */}
				<div className="flex items-center justify-between pt-3 border-t border-foreground/10">
					<span className="text-xs text-muted-foreground">
						{localChapters.length} chapter{localChapters.length === 1 ? "" : "s"} defined
					</span>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onOpenChange(false)}
							className="h-8 text-xs text-muted-foreground hover:text-foreground"
						>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={handleSave}
							className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold shadow-sm"
						>
							Save Chapters
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default ChapterManagementModal;
