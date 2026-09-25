import { ArrowsLeftRight, CaretRight, X } from "@phosphor-icons/react";
import { useTimelineContext } from "dnd-timeline";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
	type ClipRegion,
	type ClipTransition,
	DEFAULT_TRANSITION_DURATION_MS,
	MAX_TRANSITION_DURATION_MS,
	MIN_TRANSITION_DURATION_MS,
	sortClipRegions,
	TRANSITION_KIND_LABELS,
	type TransitionKind,
} from "../../../types";

interface TransitionMarkerOverlayProps {
	clipRegions: ClipRegion[];
	onClipTransitionChange?: (id: string, transition: ClipTransition | null) => void;
	/** Pixels from the timeline's top to the clip row's band (it's always the first row). */
	topOffsetPx: number;
}

interface Boundary {
	clipId: string;
	atMs: number;
	transition?: ClipTransition;
}

const TRANSITION_KINDS: TransitionKind[] = ["crossfade", "slide", "wipe"];

function TransitionEditorPopoverContent({
	transition,
	onChange,
	onRemove,
}: {
	transition?: ClipTransition;
	onChange: (transition: ClipTransition) => void;
	onRemove: () => void;
}) {
	const [kind, setKind] = useState<TransitionKind>(transition?.kind ?? "crossfade");
	const [durationMs, setDurationMs] = useState(transition?.durationMs ?? DEFAULT_TRANSITION_DURATION_MS);

	return (
		<div className="w-56 space-y-3">
			<p className="text-xs font-medium text-foreground">Transition</p>
			<div className="grid grid-cols-3 gap-1">
				{TRANSITION_KINDS.map((option) => (
					<Button
						key={option}
						type="button"
						variant={kind === option ? "default" : "outline"}
						size="sm"
						className="h-8 px-1.5 text-[11px]"
						onClick={() => {
							setKind(option);
							onChange({ kind: option, durationMs });
						}}
					>
						{TRANSITION_KIND_LABELS[option]}
					</Button>
				))}
			</div>
			<div className="space-y-1.5">
				<div className="flex items-center justify-between text-[11px] text-foreground/60">
					<span>Duration</span>
					<span>{(durationMs / 1000).toFixed(1)}s</span>
				</div>
				<Slider
					min={MIN_TRANSITION_DURATION_MS}
					max={MAX_TRANSITION_DURATION_MS}
					step={100}
					value={[durationMs]}
					onValueChange={([value]) => setDurationMs(value)}
					onValueCommit={([value]) => onChange({ kind, durationMs: value })}
				/>
			</div>
			{transition ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 w-full gap-1.5 text-[11px] text-red-400 hover:text-red-400"
					onClick={onRemove}
				>
					<X className="h-3 w-3" />
					Remove transition
				</Button>
			) : null}
		</div>
	);
}

function TransitionMarkerOverlayComponent({
	clipRegions,
	onClipTransitionChange,
	topOffsetPx,
}: TransitionMarkerOverlayProps) {
	const { direction, range, valueToPixels, sidebarWidth } = useTimelineContext();
	const sideProperty = direction === "rtl" ? "right" : "left";

	const boundaries = useMemo<Boundary[]>(() => {
		const sorted = sortClipRegions(clipRegions);
		const result: Boundary[] = [];
		for (let i = 0; i < sorted.length - 1; i++) {
			const clip = sorted[i];
			const nextClip = sorted[i + 1];
			if (nextClip.startMs !== clip.endMs) continue;
			result.push({ clipId: clip.id, atMs: clip.endMs, transition: clip.transitionOut });
		}
		return result;
	}, [clipRegions]);

	if (!onClipTransitionChange || boundaries.length === 0) return null;

	return (
		<div
			className="pointer-events-none absolute inset-x-0 bottom-0 z-[55]"
			style={{
				top: topOffsetPx,
				[sideProperty === "right" ? "marginRight" : "marginLeft"]: sidebarWidth,
			}}
		>
			{boundaries.map((boundary) => {
				const offset = valueToPixels(boundary.atMs - range.start);
				return (
					<div
						key={boundary.clipId}
						className="pointer-events-auto absolute top-3 -translate-x-1/2"
						style={{ [sideProperty]: `${offset}px` }}
					>
						<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									title={boundary.transition ? "Edit transition" : "Add transition"}
									className={`flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors ${
										boundary.transition
											? "border-[#2563EB] bg-[#2563EB] text-white"
											: "border-foreground/20 bg-editor-surface text-foreground/50 hover:border-[#2563EB]/60 hover:text-[#2563EB]"
									}`}
								>
									{boundary.transition ? (
										<ArrowsLeftRight className="h-3 w-3" weight="bold" />
									) : (
										<CaretRight className="h-2.5 w-2.5" weight="bold" />
									)}
								</button>
							</PopoverTrigger>
							<PopoverContent
								align="center"
								side="top"
								className="border-foreground/10 bg-editor-surface-alt p-3"
							>
								<TransitionEditorPopoverContent
									transition={boundary.transition}
									onChange={(transition) =>
										onClipTransitionChange(boundary.clipId, transition)
									}
									onRemove={() => onClipTransitionChange(boundary.clipId, null)}
								/>
							</PopoverContent>
						</Popover>
					</div>
				);
			})}
		</div>
	);
}

export default TransitionMarkerOverlayComponent;
