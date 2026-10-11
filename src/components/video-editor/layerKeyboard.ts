import { scaleTextFontSize } from "./annotationResize";
import type { AnnotationRegion } from "./types";

/** Move step for a plain arrow key, as percent of the video rect. */
export const MOVE_STEP_PERCENT = 0.5;
/** Move step with Shift held. */
export const MOVE_STEP_PERCENT_FAST = 5;
/** Move step with Alt held: about one screen pixel. */
export const MOVE_STEP_PIXELS = 1;
/** Ctrl + / Ctrl - change the layer size by this much. */
export const SCALE_STEP = 1.05;

export type LayerKeyAction =
	| { type: "move"; dx: -1 | 0 | 1; dy: -1 | 0 | 1; unit: "percent" | "pixel"; amount: number }
	| { type: "duplicate" }
	| { type: "deselect" }
	| { type: "order"; direction: "up" | "down" }
	| { type: "scale"; factor: number };

export interface LayerKeyInput {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	/** Focus is in a text field or the text editor. */
	editable: boolean;
	/** A layer is selected. Without one, no key is claimed (browser zoom and scrolling keep working). */
	hasSelection: boolean;
}

const ARROWS: Record<string, { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }> = {
	ArrowLeft: { dx: -1, dy: 0 },
	ArrowRight: { dx: 1, dy: 0 },
	ArrowUp: { dx: 0, dy: -1 },
	ArrowDown: { dx: 0, dy: 1 },
};

/** Maps a key press to a layer action, or null when the key is not ours. */
export function mapLayerKey(input: LayerKeyInput): LayerKeyAction | null {
	if (!input.hasSelection || input.editable) return null;
	const mod = input.ctrlKey || input.metaKey;
	const key = input.key;

	const arrow = ARROWS[key];
	if (arrow) {
		if (mod) return null;
		if (input.altKey) return { type: "move", ...arrow, unit: "pixel", amount: MOVE_STEP_PIXELS };
		return {
			type: "move",
			...arrow,
			unit: "percent",
			amount: input.shiftKey ? MOVE_STEP_PERCENT_FAST : MOVE_STEP_PERCENT,
		};
	}

	if (key === "Escape") {
		return mod || input.shiftKey || input.altKey ? null : { type: "deselect" };
	}

	if (!mod || input.altKey) return null;
	if ((key === "d" || key === "D") && !input.shiftKey) return { type: "duplicate" };
	if (key === "[") return { type: "order", direction: "down" };
	if (key === "]") return { type: "order", direction: "up" };
	if (key === "=" || key === "+") return { type: "scale", factor: SCALE_STEP };
	if (key === "-" || key === "_") return { type: "scale", factor: 1 / SCALE_STEP };
	return null;
}

export interface LayerBox {
	position: { x: number; y: number };
	size: { width: number; height: number };
	fontSize: number;
}

/** Keys held on one layer, accumulated from the box the layer had when the first key went down. */
export interface KeyboardAdjustment {
	/** Total move, percent of the video rect. */
	offset: { x: number; y: number };
	/** Total scale factor around the layer's centre. */
	scale: number;
}

export const NO_ADJUSTMENT: KeyboardAdjustment = { offset: { x: 0, y: 0 }, scale: 1 };

/** Folds one move or scale action into the adjustment. `videoRectPx` converts pixel steps to percent. */
export function accumulateAdjustment(
	adjustment: KeyboardAdjustment,
	action: LayerKeyAction,
	videoRectPx: { width: number; height: number },
): KeyboardAdjustment {
	if (action.type === "scale") {
		return { ...adjustment, scale: adjustment.scale * action.factor };
	}
	if (action.type !== "move") return adjustment;
	const stepX =
		action.unit === "pixel" ? (action.amount / Math.max(1, videoRectPx.width)) * 100 : action.amount;
	const stepY =
		action.unit === "pixel" ? (action.amount / Math.max(1, videoRectPx.height)) * 100 : action.amount;
	return {
		...adjustment,
		offset: { x: adjustment.offset.x + action.dx * stepX, y: adjustment.offset.y + action.dy * stepY },
	};
}

/**
 * The layer's box after the accumulated keys. Scaling is around the centre, so the text font
 * (whole number, 8-400) is computed from the original size each time and never stalls from rounding.
 */
export function applyAdjustment(
	base: LayerBox,
	adjustment: KeyboardAdjustment,
	layerType: AnnotationRegion["type"],
): LayerBox {
	const width = base.size.width * adjustment.scale;
	const height = base.size.height * adjustment.scale;
	return {
		position: {
			x: base.position.x + base.size.width / 2 - width / 2 + adjustment.offset.x,
			y: base.position.y + base.size.height / 2 - height / 2 + adjustment.offset.y,
		},
		size: { width, height },
		fontSize:
			layerType === "text" ? scaleTextFontSize(base.fontSize, adjustment.scale) : base.fontSize,
	};
}

/** Next stacking order for a layer moved up or down one place; null if it is already at that end. */
export function reorderedZIndexes(
	regions: { id: string; zIndex: number }[],
	id: string,
	direction: "up" | "down",
): Map<string, number> | null {
	const sorted = [...regions].sort((a, b) => a.zIndex - b.zIndex);
	const index = sorted.findIndex((region) => region.id === id);
	const neighbour = sorted[index + (direction === "up" ? 1 : -1)];
	if (index < 0 || !neighbour) return null;
	const own = sorted[index];
	// Equal zIndex values would make the swap a no-op: renumber the neighbours to distinct ranks.
	const rank = new Map(sorted.map((region, i) => [region.id, i]));
	const ownRank = rank.get(own.id) ?? 0;
	const neighbourRank = rank.get(neighbour.id) ?? 0;
	const result = new Map<string, number>();
	for (const region of sorted) {
		const current = rank.get(region.id) ?? 0;
		result.set(
			region.id,
			region.id === own.id ? neighbourRank : region.id === neighbour.id ? ownRank : current,
		);
	}
	return result;
}

/** True when keyboard focus is somewhere the user types, so layer keys must stay out of the way. */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (typeof Element === "undefined" || !(target instanceof Element)) return false;
	if (target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) {
		return true;
	}
	return Boolean(target.closest("[role='textbox'], [role='combobox'], [role='slider'], [role='listbox']"));
}
