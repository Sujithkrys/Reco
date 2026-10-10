/**
 * Layer positions and sizes are stored as percent of the video rect, so the
 * outer canvas (video plus the background around it) is a rect in the same
 * percent space whose edges can sit below 0 or above 100.
 */
export interface CanvasBoundsPercent {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface PercentRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Canvas edges in video-rect percent, from the video rect's pixel placement on the canvas. */
export function getCanvasBoundsPercent(
	videoRect: PercentRect,
	canvasWidth: number,
	canvasHeight: number,
): CanvasBoundsPercent {
	const width = Math.max(1, videoRect.width);
	const height = Math.max(1, videoRect.height);
	// `|| 0` turns -0 (video flush with the canvas) into 0.
	return {
		minX: (-videoRect.x / width) * 100 || 0,
		minY: (-videoRect.y / height) * 100 || 0,
		maxX: ((canvasWidth - videoRect.x) / width) * 100,
		maxY: ((canvasHeight - videoRect.y) / height) * 100,
	};
}

function clampStart(start: number, size: number, min: number, max: number) {
	if (!Number.isFinite(start)) return min;
	// A layer larger than the canvas pins to the near edge.
	return Math.max(min, Math.min(max - size, start));
}

/** Move: keep the size and shift the rect so it lies inside the canvas. */
export function clampMoveToCanvas(rect: PercentRect, bounds: CanvasBoundsPercent): PercentRect {
	return {
		...rect,
		x: clampStart(rect.x, rect.width, bounds.minX, bounds.maxX),
		y: clampStart(rect.y, rect.height, bounds.minY, bounds.maxY),
	};
}

/** Resize: clamp each edge to the canvas and derive the size from the clamped edges. */
export function clampEdgesToCanvas(rect: PercentRect, bounds: CanvasBoundsPercent): PercentRect {
	const left = Math.max(bounds.minX, rect.x);
	const top = Math.max(bounds.minY, rect.y);
	const right = Math.min(bounds.maxX, rect.x + rect.width);
	const bottom = Math.min(bounds.maxY, rect.y + rect.height);
	if (right <= left || bottom <= top) {
		// Entirely outside the canvas: bring it back in rather than collapsing it.
		return clampEdgesToCanvas(clampMoveToCanvas(rect, bounds), bounds);
	}
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/** After the canvas changes: shift back inside first, and shrink only if still too big. */
export function fitRectToCanvas(rect: PercentRect, bounds: CanvasBoundsPercent): PercentRect {
	return clampEdgesToCanvas(clampMoveToCanvas(rect, bounds), bounds);
}

export function areCanvasBoundsEqual(
	a: CanvasBoundsPercent,
	b: CanvasBoundsPercent,
	tolerance = 0.05,
): boolean {
	return (
		Math.abs(a.minX - b.minX) <= tolerance &&
		Math.abs(a.minY - b.minY) <= tolerance &&
		Math.abs(a.maxX - b.maxX) <= tolerance &&
		Math.abs(a.maxY - b.maxY) <= tolerance
	);
}

export function isSameRect(a: PercentRect, b: PercentRect, tolerance = 0.001): boolean {
	return (
		Math.abs(a.x - b.x) <= tolerance &&
		Math.abs(a.y - b.y) <= tolerance &&
		Math.abs(a.width - b.width) <= tolerance &&
		Math.abs(a.height - b.height) <= tolerance
	);
}
