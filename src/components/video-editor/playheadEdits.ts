import { changeAudioSpan } from "./audioSpanChange";
import { changeClipSpan } from "./clipSpanChange";
import { planClipSplit } from "./clipSplit";
import {
	replaceWithSplit,
	splitAnnotationAt,
	splitAudioAt,
	splitZoomAt,
} from "./layerSplit";
import type { AnnotationRegion, AudioRegion, ClipRegion, ZoomRegion } from "./types";

/** The timeline items that split and trim-to-playhead act on. */
export interface PlayheadEditLayers {
	clipRegions: ClipRegion[];
	zoomRegions: ZoomRegion[];
	annotationRegions: AnnotationRegion[];
	audioRegions: AudioRegion[];
}

export type PlayheadEditKind = "clip" | "zoom" | "annotation" | "audio";

/** One selected item, or "all": the clip under the playhead plus every layer under it. */
export type PlayheadEditTarget = { kind: PlayheadEditKind; id: string } | "all";

export interface PlayheadEditResult {
	layers: PlayheadEditLayers;
	/** Number of items changed; 0 means nothing to do. */
	count: number;
}

export interface PlayheadSplitIds {
	clip: () => string;
	zoom: () => string;
	annotation: () => string;
	audio: () => string;
}

export interface PlayheadTrimOptions {
	/** Length of the recording, so a trimmed clip cannot read past its end. */
	sourceDurationMs: number;
	/** File length for audio regions without a stored sourceDurationMs. */
	getAudioFileDurationMs?: (region: AudioRegion) => number | undefined;
}

const isTargeted = (target: PlayheadEditTarget, kind: PlayheadEditKind, id: string) =>
	target === "all" || (target.kind === kind && target.id === id);

/** A layer is "under the playhead" for trimming when start <= t < end. */
const isUnderPlayhead = (item: { startMs: number; endMs: number }, atMs: number) =>
	atMs >= item.startMs && atMs < item.endMs;

/**
 * Split at the playhead: the selected item, or (target "all") the clip under the
 * playhead and every zoom, annotation and audio item with start < t < end.
 */
export function planSplitAtPlayhead(
	layers: PlayheadEditLayers,
	target: PlayheadEditTarget,
	atMs: number,
	ids: PlayheadSplitIds,
): PlayheadEditResult {
	let count = 0;
	let clipRegions = layers.clipRegions;
	const clipCandidates =
		target === "all"
			? clipRegions
			: target.kind === "clip"
				? clipRegions.filter((clip) => clip.id === target.id)
				: [];
	const clipPlan = planClipSplit({ clipRegions: clipCandidates, splitMs: atMs, createId: ids.clip });
	if (clipPlan) {
		clipRegions = clipRegions.flatMap((clip) =>
			clip.id === clipPlan.targetId ? [clipPlan.left, clipPlan.right] : [clip],
		);
		count += 1;
	}

	const splitEach = <T extends { id: string }>(
		items: T[],
		kind: PlayheadEditKind,
		split: (item: T) => { left: T; right: T } | null,
	) => {
		let next = items;
		for (const item of items) {
			if (!isTargeted(target, kind, item.id)) continue;
			const result = split(item);
			if (!result) continue;
			next = replaceWithSplit(next, item.id, result);
			count += 1;
		}
		return next;
	};

	const zoomRegions = splitEach(layers.zoomRegions, "zoom", (zoom) =>
		splitZoomAt(zoom, atMs, ids.zoom),
	);
	const annotationRegions = splitEach(layers.annotationRegions, "annotation", (annotation) =>
		splitAnnotationAt(annotation, atMs, ids.annotation),
	);
	const audioRegions = splitEach(layers.audioRegions, "audio", (audio) =>
		splitAudioAt(audio, atMs, ids.audio),
	);

	return { layers: { clipRegions, zoomRegions, annotationRegions, audioRegions }, count };
}

/**
 * Trim the start or end of the selected item (or, for "all", the clip under the
 * playhead and every layer with start <= t < end) to the playhead. Uses the same
 * span logic as dragging an edge, so trimming audio's start moves sourceStartMs.
 */
export function planTrimToPlayhead(
	layers: PlayheadEditLayers,
	target: PlayheadEditTarget,
	edge: "start" | "end",
	atMs: number,
	options: PlayheadTrimOptions,
): PlayheadEditResult {
	let count = 0;
	const t = Math.round(atMs);
	const trimmedSpan = (item: { startMs: number; endMs: number }) => {
		// Strictly inside, so neither half collapses to nothing.
		if (!Number.isFinite(t) || t <= item.startMs || t >= item.endMs) return null;
		return edge === "start"
			? { startMs: t, endMs: item.endMs }
			: { startMs: item.startMs, endMs: t };
	};
	const trimEach = <T extends { id: string; startMs: number; endMs: number }>(
		items: T[],
		kind: PlayheadEditKind,
		apply: (item: T, span: { startMs: number; endMs: number }) => T,
		limitToOne = false,
	) => {
		let trimmedOne = false;
		return items.map((item) => {
			if (!isTargeted(target, kind, item.id) || !isUnderPlayhead(item, t)) return item;
			if (limitToOne && trimmedOne) return item;
			const span = trimmedSpan(item);
			if (!span) return item;
			trimmedOne = true;
			count += 1;
			return apply(item, span);
		});
	};

	// Only the clip under the playhead (clips do not overlap, so this is at most one).
	const clipRegions = trimEach(
		layers.clipRegions,
		"clip",
		(clip, span) => changeClipSpan(clip, span.startMs, span.endMs, options.sourceDurationMs),
		true,
	);
	const zoomRegions = trimEach(layers.zoomRegions, "zoom", (zoom, span) => ({ ...zoom, ...span }));
	const annotationRegions = trimEach(layers.annotationRegions, "annotation", (annotation, span) => ({
		...annotation,
		...span,
	}));
	const audioRegions = trimEach(layers.audioRegions, "audio", (audio, span) =>
		changeAudioSpan(
			audio,
			span.startMs,
			span.endMs,
			audio.sourceDurationMs ?? options.getAudioFileDurationMs?.(audio),
		),
	);

	return { layers: { clipRegions, zoomRegions, annotationRegions, audioRegions }, count };
}
