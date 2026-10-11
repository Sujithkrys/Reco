import { useCallback, useEffect, useRef } from "react";
import {
	type AnnotationPreviewPatch,
	clearAnnotationPreview,
	previewAnnotation,
} from "../annotationHoverPreview";
import {
	accumulateAdjustment,
	applyAdjustment,
	isEditableTarget,
	type KeyboardAdjustment,
	type LayerBox,
	type LayerKeyAction,
	mapLayerKey,
	NO_ADJUSTMENT,
} from "../layerKeyboard";
import type { AnnotationRegion } from "../types";
import type { useAnnotationRegionCommands } from "./useAnnotationRegionCommands";

/** A held key is committed after this long without another press (or at once on key up). */
export const KEY_COMMIT_IDLE_MS = 300;

/** Keys whose release ends a held adjustment. */
const ADJUSTMENT_KEYS = new Set([
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
	"=",
	"+",
	"-",
	"_",
	"Control",
	"Meta",
	"Shift",
	"Alt",
]);

type Pending = {
	id: string;
	type: AnnotationRegion["type"];
	base: LayerBox;
	adjustment: KeyboardAdjustment;
};

interface Params {
	annotationRegions: AnnotationRegion[];
	selectedAnnotationId: string | null;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	/** Deselects the layer (and the other timeline selections). */
	onDeselect: () => void;
	/** Ctrl+D is configured as the delete shortcut (the old default): duplicate then stays out of its way. */
	ctrlDIsDelete: boolean;
}

/** The video rect on screen, for Alt+Arrow's one-pixel steps. */
function readVideoRectPx(): { width: number; height: number } {
	const rect = document.querySelector("[data-annotation-layers]")?.getBoundingClientRect();
	return rect && rect.width > 0 && rect.height > 0
		? { width: rect.width, height: rect.height }
		: { width: 1000, height: 560 };
}

/**
 * Keyboard control of the selected layer: arrows move, Ctrl+D duplicates, Esc deselects,
 * Ctrl+[ / ] reorder, Ctrl+= / Ctrl+- scale. Held moves and scales are shown as a preview and
 * written once (on key up or after a short idle), so a held key is one undo step. Keys are only
 * claimed while a layer is selected and focus is not in a text field.
 */
export function useLayerKeyboardShortcuts({
	annotationRegions,
	selectedAnnotationId,
	annotationCommands,
	onDeselect,
	ctrlDIsDelete,
}: Params) {
	const pendingRef = useRef<Pending | null>(null);
	const timerRef = useRef<number | null>(null);
	const latest = useRef({ annotationRegions, selectedAnnotationId, annotationCommands, onDeselect, ctrlDIsDelete });
	latest.current = { annotationRegions, selectedAnnotationId, annotationCommands, onDeselect, ctrlDIsDelete };

	const commit = useCallback(() => {
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		timerRef.current = null;
		const pending = pendingRef.current;
		pendingRef.current = null;
		if (!pending) return;
		const result = applyAdjustment(pending.base, pending.adjustment, pending.type);
		const { annotationCommands: commands } = latest.current;
		// Position, size and font change together: one undo step.
		commands.handleAnnotationPositionChange(pending.id, result.position);
		commands.handleAnnotationSizeChange(pending.id, result.size);
		if (pending.type === "text" && result.fontSize !== pending.base.fontSize) {
			commands.handleAnnotationStyleChange(pending.id, { fontSize: result.fontSize });
		}
		// Drop the preview a frame later, once the committed values are on screen.
		requestAnimationFrame(() => clearAnnotationPreview());
	}, []);

	useEffect(() => {
		const adjust = (action: LayerKeyAction, selected: AnnotationRegion) => {
			let pending = pendingRef.current;
			if (pending && pending.id !== selected.id) {
				commit();
				pending = null;
			}
			if (!pending) {
				pending = {
					id: selected.id,
					type: selected.type,
					base: {
						position: { ...selected.position },
						size: { ...selected.size },
						fontSize: selected.style.fontSize,
					},
					adjustment: NO_ADJUSTMENT,
				};
				pendingRef.current = pending;
			}
			pending.adjustment = accumulateAdjustment(pending.adjustment, action, readVideoRectPx());
			const shown = applyAdjustment(pending.base, pending.adjustment, pending.type);
			const patch: AnnotationPreviewPatch = {
				position: shown.position,
				size: shown.size,
				...(pending.type === "text" ? { style: { fontSize: shown.fontSize } } : {}),
			};
			previewAnnotation(pending.id, patch);
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
			timerRef.current = window.setTimeout(commit, KEY_COMMIT_IDLE_MS);
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			const { annotationRegions: regions, selectedAnnotationId: selectedId } = latest.current;
			const selected = selectedId ? regions.find((region) => region.id === selectedId) : undefined;
			const action = mapLayerKey({
				key: event.key,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				shiftKey: event.shiftKey,
				altKey: event.altKey,
				editable: isEditableTarget(event.target) || event.isComposing,
				hasSelection: Boolean(selected),
			});
			if (!action || !selected) return;
			if (action.type === "duplicate" && latest.current.ctrlDIsDelete) return;
			event.preventDefault();
			const { annotationCommands: commands } = latest.current;
			switch (action.type) {
				case "move":
				case "scale":
					adjust(action, selected);
					return;
				case "duplicate":
					commit();
					commands.handleAnnotationDuplicate(selected.id);
					return;
				case "order":
					commit();
					commands.handleAnnotationReorder(selected.id, action.direction);
					return;
				case "deselect":
					commit();
					latest.current.onDeselect();
					return;
			}
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (pendingRef.current && ADJUSTMENT_KEYS.has(event.key)) commit();
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
			pendingRef.current = null;
			clearAnnotationPreview();
		};
	}, [commit]);
}
