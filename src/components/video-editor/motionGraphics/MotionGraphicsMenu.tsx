import { ArrowClockwise, Copy, Plus, Sparkle } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { GeneratedClipRegion } from "../types";
import {
	ensureProjectRegistered,
	getGeneratedClipSpecDurationMs,
	getGeneratedClipSpecLabel,
	listMotionGraphicClips,
	type MotionGraphicClipRow,
} from "./motionGraphicsClient";

interface MotionGraphicsMenuProps {
	projectId: string | null;
	projectDisplayName: string;
	currentTimeMs: number;
	onInsertGeneratedClip: (region: GeneratedClipRegion) => void;
}

export function MotionGraphicsMenu({
	projectId,
	projectDisplayName,
	currentTimeMs,
	onInsertGeneratedClip,
}: MotionGraphicsMenuProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [clips, setClips] = useState<MotionGraphicClipRow[]>([]);

	const refresh = useCallback(async () => {
		if (!projectId) return;
		setLoading(true);
		setError(null);
		try {
			await ensureProjectRegistered(projectId, projectDisplayName);
			const rows = await listMotionGraphicClips(projectId);
			setClips(rows);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [projectId, projectDisplayName]);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			setOpen(next);
			if (next) void refresh();
		},
		[refresh],
	);

	const handleCopyId = useCallback(() => {
		if (!projectId) return;
		void navigator.clipboard.writeText(projectId);
		toast.success("Project ID copied");
	}, [projectId]);

	const handleInsert = useCallback(
		(clip: MotionGraphicClipRow) => {
			// TEMP diagnostic -- remove once the video-less timeline gate is
			// confirmed working.
			console.log("[MotionGraphicsMenu debug] handleInsert called", {
				projectId,
				currentTimeMs,
				clipId: clip.id,
			});
			if (!projectId) return;
			const durationMs = getGeneratedClipSpecDurationMs(clip.spec);
			const startMs = Math.max(0, Math.round(currentTimeMs));
			const region = {
				id: crypto.randomUUID(),
				startMs,
				endMs: startMs + durationMs,
				videoUrl: clip.videoUrl,
				spec: clip.spec,
				clipId: clip.id,
				projectId,
			};
			console.log("[MotionGraphicsMenu debug] built region, calling onInsertGeneratedClip", region);
			onInsertGeneratedClip(region);
			toast.success("Inserted at playhead");
			setOpen(false);
		},
		[projectId, currentTimeMs, onInsertGeneratedClip],
	);

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-foreground/10 bg-foreground/5 px-2.5 text-foreground transition-colors hover:bg-foreground/10"
					title="Motion graphics"
				>
					<Sparkle className="h-4 w-4" />
					<span className="text-xs font-medium">Motion Graphics</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-96">
				<div className="flex flex-col gap-3">
					<div>
						<div className="text-sm font-semibold text-foreground">Motion Graphics</div>
						<p className="mt-1 text-xs text-muted-foreground">
							Ask Claude (with the Reco Motion Graphics connector) to create a clip for this
							project, then insert it here at your current playhead position.
						</p>
					</div>

					{projectId ? (
						<div className="flex items-center gap-1.5 rounded-md border border-foreground/10 bg-foreground/5 px-2 py-1.5">
							<code className="flex-1 truncate text-[11px] text-foreground/80">{projectId}</code>
							<button
								type="button"
								onClick={handleCopyId}
								className="shrink-0 rounded p-1 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
								title="Copy project ID"
							>
								<Copy className="h-3.5 w-3.5" />
							</button>
						</div>
					) : (
						<p className="text-xs text-muted-foreground">
							Save this project first to get a project ID.
						</p>
					)}

					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-foreground/70">Clips</span>
						<button
							type="button"
							onClick={() => void refresh()}
							disabled={!projectId || loading}
							className="inline-flex items-center gap-1 rounded p-1 text-xs text-foreground/60 hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
							title="Refresh"
						>
							<ArrowClockwise className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
						</button>
					</div>

					{error ? (
						<p className="text-xs text-red-500">{error}</p>
					) : clips.length === 0 && !loading ? (
						<p className="text-xs text-muted-foreground">
							No clips yet for this project.
						</p>
					) : (
						<div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
							{clips.map((clip) => (
								<div
									key={clip.id}
									className="flex items-center justify-between gap-2 rounded-md border border-foreground/10 px-2 py-1.5"
								>
									<div className="min-w-0 flex-1">
										<div className="truncate text-xs font-medium text-foreground/90">
											{getGeneratedClipSpecLabel(clip.spec)}
										</div>
										<div className="text-[10px] text-muted-foreground">
											{new Date(clip.createdAt).toLocaleString()}
										</div>
									</div>
									<button
										type="button"
										onClick={() => handleInsert(clip)}
										className="inline-flex shrink-0 items-center gap-1 rounded-md bg-foreground/10 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-foreground/15"
										title="Insert at playhead"
									>
										<Plus className="h-3 w-3" />
										Insert
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
