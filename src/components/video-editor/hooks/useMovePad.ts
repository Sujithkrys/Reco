import { useCallback, useEffect, useRef } from "react";
import { clearAnnotationPreview, previewAnnotation } from "../annotationHoverPreview";
import {
	accumulateAdjustment,
	applyAdjustment,
	type KeyboardAdjustment,
	MOVE_STEP_PERCENT,
	MOVE_STEP_PERCENT_FAST,
	NO_ADJUSTMENT,
} from "../layerKeyboard";
import type { AnnotationRegion } from "../types";

/** A held pad button starts repeating after this long, then every REPEAT_MS. */
export const PAD_REPEAT_DELAY_MS = 400;
export const PAD_REPEAT_MS = 80;

type Direction = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

/**
 * The move pad in the annotation panel. A click moves the layer 0.5 percent of the video rect
 * (5 with Shift), a held button repeats. It uses the keyboard's move logic: the steps add up in a
 * preview and the layer is written once on release, so one click or one hold is one undo step.
 */
export function useMovePad(
	annotation: Pick<AnnotationRegion, "id" | "position" | "size" | "style" | "type">,
	onPositionChange: ((position: { x: number; y: number }) => void) | undefined,
) {
	const latest = useRef({ annotation, onPositionChange });
	latest.current = { annotation, onPositionChange };
	const pending = useRef<{ id: string; base: AnnotationRegion["position"]; adjustment: KeyboardAdjustment } | null>(
		null,
	);
	const timers = useRef<{ delay: number | null; repeat: number | null }>({ delay: null, repeat: null });

	const stopTimers = () => {
		if (timers.current.delay !== null) window.clearTimeout(timers.current.delay);
		if (timers.current.repeat !== null) window.clearInterval(timers.current.repeat);
		timers.current = { delay: null, repeat: null };
	};

	const step = useCallback((direction: Direction, fast: boolean) => {
		const { annotation: layer } = latest.current;
		if (!pending.current || pending.current.id !== layer.id) {
			pending.current = { id: layer.id, base: { ...layer.position }, adjustment: NO_ADJUSTMENT };
		}
		const current = pending.current;
		current.adjustment = accumulateAdjustment(
			current.adjustment,
			{
				type: "move",
				...direction,
				unit: "percent",
				amount: fast ? MOVE_STEP_PERCENT_FAST : MOVE_STEP_PERCENT,
			},
			{ width: 1, height: 1 },
		);
		const shown = applyAdjustment(
			{ position: current.base, size: layer.size, fontSize: layer.style.fontSize },
			current.adjustment,
			layer.type,
		);
		previewAnnotation(layer.id, { position: shown.position });
	}, []);

	const release = useCallback(() => {
		stopTimers();
		const current = pending.current;
		pending.current = null;
		if (!current) return;
		const { annotation: layer, onPositionChange: commit } = latest.current;
		const shown = applyAdjustment(
			{ position: current.base, size: layer.size, fontSize: layer.style.fontSize },
			current.adjustment,
			layer.type,
		);
		if (current.id === layer.id) commit?.(shown.position);
		requestAnimationFrame(() => clearAnnotationPreview());
	}, []);

	/** Pointer down on a pad button: one step now, repeating while held. */
	const press = useCallback(
		(direction: Direction, fast: boolean) => {
			release();
			step(direction, fast);
			timers.current.delay = window.setTimeout(() => {
				timers.current.repeat = window.setInterval(() => step(direction, fast), PAD_REPEAT_MS);
			}, PAD_REPEAT_DELAY_MS);
		},
		[release, step],
	);

	// Leaving the panel (or the layer) mid-hold commits what was moved so far.
	useEffect(() => release, [release, annotation.id]);

	return { press, release };
}
