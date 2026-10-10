/**
 * Layer positions and sizes are stored as percent of the video rect. Layers are
 * not limited to the canvas: they may sit partly or fully outside it and the
 * export crops whatever falls outside.
 */
export interface PercentRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Replace non-finite values so a bad pointer event can never poison a layer. */
export function sanitizeRect(rect: PercentRect): PercentRect {
	return {
		x: Number.isFinite(rect.x) ? rect.x : 0,
		y: Number.isFinite(rect.y) ? rect.y : 0,
		width: Number.isFinite(rect.width) ? Math.max(0, rect.width) : 0,
		height: Number.isFinite(rect.height) ? Math.max(0, rect.height) : 0,
	};
}
