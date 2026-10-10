import type { AnnotationType } from "./types";

/** A resize handle: an edge (n, s, e, w) or a corner (ne, nw, se, sw). */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface ResizeRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface LayerResizeInput {
	handle: ResizeHandle;
	/** The layer's rect when the drag started. */
	start: ResizeRect;
	/** Pointer movement since the drag started, in the same units as the rect. */
	delta: { x: number; y: number };
	/** Shift: free corner resize. Alt: resize from the centre. */
	modifiers?: { shift?: boolean; alt?: boolean };
	layerType: AnnotationType;
	/** Smallest width and height the box may shrink to. */
	minSize: number;
}

export interface LayerResizeResult {
	rect: ResizeRect;
	/** Factor to apply to a text layer's font size; 1 when the font must not change. */
	fontScale: number;
}

export const MIN_TEXT_FONT_SIZE = 8;
export const MAX_TEXT_FONT_SIZE = 400;

export function isCornerHandle(handle: ResizeHandle): boolean {
	return handle.length === 2;
}

/**
 * Standard layer resize. An edge moves only that edge (the opposite edge stays
 * put). A corner keeps the box's aspect ratio from drag start and pins the
 * opposite corner; Shift frees the ratio and Alt resizes around the centre.
 * Text layers scale their font with an aspect-locked corner drag (Canva-style);
 * edges only change the box (width re-wraps text, height just changes height).
 */
export function computeLayerResize({
	handle,
	start,
	delta,
	modifiers = {},
	layerType,
	minSize,
}: LayerResizeInput): LayerResizeResult {
	const fromCentre = Boolean(modifiers.alt);
	const growth = fromCentre ? 2 : 1;
	const movesEast = handle.includes("e");
	const movesWest = handle.includes("w");
	const movesSouth = handle.includes("s");
	const movesNorth = handle.includes("n");
	const safeMin = Math.max(1, minSize);
	const startWidth = Math.max(safeMin, start.width);
	const startHeight = Math.max(safeMin, start.height);

	// Size the pointer asks for on each axis it controls.
	let width = start.width;
	let height = start.height;
	if (movesEast) width = start.width + delta.x * growth;
	if (movesWest) width = start.width - delta.x * growth;
	if (movesSouth) height = start.height + delta.y * growth;
	if (movesNorth) height = start.height - delta.y * growth;

	let fontScale = 1;
	if (isCornerHandle(handle) && !modifiers.shift) {
		// Follow whichever axis the pointer moved further, relative to the box.
		const scaleX = width / startWidth;
		const scaleY = height / startHeight;
		let scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
		scale = Math.max(scale, safeMin / startWidth, safeMin / startHeight);
		width = startWidth * scale;
		height = startHeight * scale;
		if (layerType === "text") fontScale = scale;
	} else {
		width = Math.max(safeMin, width);
		height = Math.max(safeMin, height);
	}

	// Pin the opposite edge/corner, or the centre with Alt.
	const centreX = start.x + start.width / 2;
	const centreY = start.y + start.height / 2;
	const changesWidth = movesEast || movesWest;
	const changesHeight = movesNorth || movesSouth;
	const x = !changesWidth
		? start.x
		: fromCentre
			? centreX - width / 2
			: movesWest
				? start.x + start.width - width
				: start.x;
	const y = !changesHeight
		? start.y
		: fromCentre
			? centreY - height / 2
			: movesNorth
				? start.y + start.height - height
				: start.y;

	return {
		rect: {
			x,
			y,
			width: changesWidth ? width : start.width,
			height: changesHeight ? height : start.height,
		},
		fontScale,
	};
}

/** A text layer's font size after a resize: a whole number between 8 and 400 px. */
export function scaleTextFontSize(fontSize: number, fontScale: number): number {
	const scaled = Math.round(fontSize * fontScale);
	return Math.min(MAX_TEXT_FONT_SIZE, Math.max(MIN_TEXT_FONT_SIZE, scaled));
}

const RND_DIRECTION_TO_HANDLE: Record<string, ResizeHandle> = {
	top: "n",
	bottom: "s",
	right: "e",
	left: "w",
	topRight: "ne",
	topLeft: "nw",
	bottomRight: "se",
	bottomLeft: "sw",
};

/** Map react-rnd's resize direction to a handle. */
export function handleFromRndDirection(direction: string): ResizeHandle | null {
	return RND_DIRECTION_TO_HANDLE[direction] ?? null;
}
