import type { Span } from "dnd-timeline";
import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { GeneratedClipRegion, GeneratedClipSpec } from "../types";

interface UseGeneratedClipRegionCommandsParams {
	setGeneratedClipRegions: Dispatch<SetStateAction<GeneratedClipRegion[]>>;
	selectedGeneratedClipId: string | null;
	setSelectedGeneratedClipId: Dispatch<SetStateAction<string | null>>;
}

export function useGeneratedClipRegionCommands({
	setGeneratedClipRegions,
	selectedGeneratedClipId,
	setSelectedGeneratedClipId,
}: UseGeneratedClipRegionCommandsParams) {
	// Unlike annotations (drawn fresh with default content), a generated clip
	// always arrives fully formed — from an MCP create_motion_graphic result or
	// an existing motion_graphic_clips row — so this takes the whole region
	// rather than synthesizing default content.
	const handleGeneratedClipAdded = useCallback(
		(region: GeneratedClipRegion) => {
			// TEMP diagnostic -- remove once the video-less timeline gate is
			// confirmed working.
			console.log("[handleGeneratedClipAdded debug] called with region:", region);
			setGeneratedClipRegions((current) => {
				const next = [...current, region];
				console.log("[handleGeneratedClipAdded debug] setGeneratedClipRegions ->", next);
				return next;
			});
			setSelectedGeneratedClipId(region.id);
		},
		[setGeneratedClipRegions, setSelectedGeneratedClipId],
	);

	const handleGeneratedClipSpanChange = useCallback(
		(id: string, span: Span) => {
			setGeneratedClipRegions((current) =>
				current.map((region) =>
					region.id === id
						? { ...region, startMs: Math.round(span.start), endMs: Math.round(span.end) }
						: region,
				),
			);
		},
		[setGeneratedClipRegions],
	);

	const handleGeneratedClipDelete = useCallback(
		(id: string) => {
			setGeneratedClipRegions((current) => current.filter((region) => region.id !== id));
			if (selectedGeneratedClipId === id) setSelectedGeneratedClipId(null);
		},
		[selectedGeneratedClipId, setGeneratedClipRegions, setSelectedGeneratedClipId],
	);

	// Called once a structured-field edit's re-render round trip (render ->
	// upload -> DB update) has completed, so the timeline/preview pick up the
	// new video without needing a full reload.
	const handleGeneratedClipRenderResult = useCallback(
		(id: string, spec: GeneratedClipSpec, videoUrl: string) => {
			setGeneratedClipRegions((current) =>
				current.map((region) => (region.id === id ? { ...region, spec, videoUrl } : region)),
			);
		},
		[setGeneratedClipRegions],
	);

	return {
		handleGeneratedClipAdded,
		handleGeneratedClipSpanChange,
		handleGeneratedClipDelete,
		handleGeneratedClipRenderResult,
	};
}
