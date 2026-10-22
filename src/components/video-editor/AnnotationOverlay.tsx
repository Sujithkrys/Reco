import { decideTextClick } from "./textClickDecision";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import { sanitizeRect } from "./annotationCanvasBounds";
import {
	computeLayerResize,
	handleFromRndDirection,
	type ResizeHandle,
} from "./annotationResize";
import {
	canvasTextMeasurer,
	hasTextBackground,
	layoutRichTextBox,
	TEXT_BACKGROUND_RADIUS,
	TEXT_BOX_PADDING,
	TEXT_INSET_X_EM,
	TEXT_INSET_Y_EM,
	TEXT_LINE_HEIGHT,
} from "./annotationTextLayout";
import {
	domText,
	nextCodePoint,
	offsetOf,
	previousCodePoint,
	rangeOf,
	renderRunsInto,
	runCss,
	selectedOffsets,
	selectOffsets,
	showRememberedSelection,
} from "./richTextDom";
import {
	diffText,
	editTextRuns,
	MIXED,
	plainTextOf,
	runsOf,
	scaleTextLayer,
	styledRunsOf,
	styleSummary,
	type TextStylePatch,
} from "./textRuns";
import { clearTextSelection, setTextSelection, useTextSelection } from "./textSelectionStore";
import { getArrowComponent } from "./ArrowSvgs";
import {
	type AnnotationRegion,
	BASE_PREVIEW_WIDTH,
	BLUR_ANNOTATION_STRENGTH,
	DEFAULT_SHAPE_DATA,
	type TextRun,
} from "./types";

type Rect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

type SceneTransform = {
	scale: number;
	x: number;
	y: number;
};

interface AnnotationOverlayProps {
	annotation: AnnotationRegion;
	isSelected: boolean;
	containerWidth: number;
	containerHeight: number;
	recordingRect: Rect;
	sceneTransform: SceneTransform;
	interactionScale?: number;
	onPositionChange: (id: string, position: { x: number; y: number }) => void;
	onSizeChange: (id: string, size: { width: number; height: number }) => void;
	/** Text corner resizes scale the font; the new size is written through this. */
	onStyleChange?: (id: string, style: Partial<AnnotationRegion["style"]>) => void;
	/** A text corner resize: every font size of the layer (layer and runs) times this factor. */
	onTextScale?: (id: string, factor: number) => void;
	/** Text typed on the canvas: the new runs, and whether it continues the last typing burst (one undo step). */
	onTextEdit?: (id: string, runs: TextRun[], continueBurst: boolean) => void;
	/** Bold/italic/underline shortcuts in the canvas editor (selection-aware, like the panel). */
	onTextStyleApply?: (id: string, patch: TextStylePatch) => void;
	onClick: (id: string) => void;
		/** Selects the layer without cycling to another one (a tap on a text layer, which also starts editing). */
		onSelect?: (id: string) => void;
	zIndex: number;
	isSelectedBoost: boolean; // Boost z-index when selected for easy editing
}

let measureContext: CanvasRenderingContext2D | null | undefined;
/** A shared 2D context for measuring text, so the preview wraps like the export canvas. */
function getMeasureContext(): CanvasRenderingContext2D | null {
	if (measureContext === undefined) {
		measureContext =
			typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
	}
	return measureContext;
}

/** Bumps when web fonts finish loading, so text measured with a fallback font is re-measured. */
function useFontsVersion(): number {
	const [version, setVersion] = useState(0);
	useEffect(() => {
		const fonts = typeof document === "undefined" ? undefined : document.fonts;
		if (!fonts) return;
		const bump = () => setVersion((current) => current + 1);
		fonts.addEventListener("loadingdone", bump);
		return () => fonts.removeEventListener("loadingdone", bump);
	}, []);
	return version;
}

/** Smallest box a resize may produce, in overlay pixels. */
const MIN_LAYER_SIZE_PX = 10;
// (the tap tolerance lives in textClickDecision.ts)
/** Keystrokes closer together than this are one typing burst: one undo step. */
const TYPING_BURST_MS = 1000;

type PointerLikeEvent = (MouseEvent | TouchEvent) | { nativeEvent: MouseEvent | TouchEvent };

function nativeOf(event: PointerLikeEvent): MouseEvent | TouchEvent {
	return "nativeEvent" in event ? event.nativeEvent : event;
}

/** Client coordinates of a mouse or touch event (the first touch). */
function pointerOf(event: PointerLikeEvent): { x: number; y: number } | null {
	const native = nativeOf(event);
	if ("touches" in native) {
		const touch = native.touches[0] ?? native.changedTouches[0];
		return touch ? { x: touch.clientX, y: touch.clientY } : null;
	}
	return { x: native.clientX, y: native.clientY };
}

function modifiersOf(event: PointerLikeEvent): { shift: boolean; alt: boolean } {
	const native = nativeOf(event);
	return { shift: native.shiftKey, alt: native.altKey };
}

/** Render an annotation in preview space with editor drag and resize controls. */
export function AnnotationOverlay({
	annotation,
	isSelected,
	containerWidth,
	containerHeight,
	recordingRect,
	sceneTransform,
	interactionScale = 1,
	onPositionChange,
	onSizeChange,
	onStyleChange,
	onTextEdit,
	onTextStyleApply,
	onTextScale,
	onClick,
		onSelect,
		zIndex,
	isSelectedBoost,
}: AnnotationOverlayProps) {
	const safeRecordingRect =
		recordingRect.width > 0 && recordingRect.height > 0
			? recordingRect
			: { x: 0, y: 0, width: containerWidth, height: containerHeight };
	const sceneX = safeRecordingRect.x + (annotation.position.x / 100) * safeRecordingRect.width;
	const sceneY = safeRecordingRect.y + (annotation.position.y / 100) * safeRecordingRect.height;
	const sceneWidth = (annotation.size.width / 100) * safeRecordingRect.width;
	const sceneHeight = (annotation.size.height / 100) * safeRecordingRect.height;
	const x = sceneX * sceneTransform.scale + sceneTransform.x;
	const y = sceneY * sceneTransform.scale + sceneTransform.y;
	const width = sceneWidth * sceneTransform.scale;
	const height = sceneHeight * sceneTransform.scale;
	const sizeScale = safeRecordingRect.width / BASE_PREVIEW_WIDTH;
	const blurScaleFactor = sizeScale * sceneTransform.scale;

	const isDraggingRef = useRef(false);
	const rndRef = useRef<Rnd | null>(null);
	// A resize in progress: where it started, and the rect/font it has reached.
	const resizeSessionRef = useRef<{
		handle: ResizeHandle;
		startRect: Rect;
		startPointer: { x: number; y: number };
		/** The latest pointer position, so a modifier change can re-run the resize without a pointer move. */
		lastPointer: { x: number; y: number };
	} | null>(null);
	// Detaches the window key listeners that follow Shift/Alt while a resize runs.
	const stopModifierWatchRef = useRef<(() => void) | null>(null);
	useEffect(() => () => stopModifierWatchRef.current?.(), []);
	// fontScale: the factor every text size is multiplied by (a corner resize of a text layer).
	type ResizeResult = { rect: Rect; fontScale: number };
	const [liveResize, setLiveResizeState] = useState<ResizeResult | null>(null);
	// Mirrors liveResize so onResizeStop always sees the last move, even before a re-render.
	const liveResizeRef = useRef<ResizeResult | null>(null);
	const setLiveResize = (value: ResizeResult | null) => {
		liveResizeRef.current = value;
		setLiveResizeState(value);
	};
	// The committed result, shown until the stored position/size catch up so the
	// box never snaps back for a frame after the drag ends.
	const [pendingResize, setPendingResize] = useState<ResizeResult | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: any change to the stored rect or font supersedes the pending one
	useEffect(() => {
		setPendingResize(null);
	}, [
		annotation.position.x,
		annotation.position.y,
		annotation.size.width,
		annotation.size.height,
		annotation.style.fontSize,
		annotation.textRuns,
		safeRecordingRect.width,
		safeRecordingRect.height,
	]);
	const displayed = liveResize ?? pendingResize;
	const displayRect = displayed?.rect ?? { x, y, width, height };
	const fontsVersion = useFontsVersion();
	// While a corner resize runs, every run's size follows the factor (committed rounded later).
	const liveFontScale = displayed?.fontScale ?? 1;
	const textBoxWidth = displayRect.width;
	const textBoxHeight = displayRect.height;
	const styledText = useMemo(
		() => styledRunsOf(annotation, sizeScale * liveFontScale),
		[annotation, sizeScale, liveFontScale],
	);
	const textFontSize = styledText.base.fontSize;
	const textLayout = useMemo(() => {
		if (annotation.type !== "text") return null;
		const ctx = getMeasureContext();
		if (!ctx) return null;
		return layoutRichTextBox(
			styledText.runs,
			styledText.base,
			annotation.style.textAlign,
			{ x: 0, y: 0, width: textBoxWidth, height: textBoxHeight, scale: sizeScale },
			canvasTextMeasurer(ctx),
		);
		// fontsVersion re-measures once web fonts finish loading.
	}, [annotation.type, annotation.style.textAlign, styledText, textBoxWidth, textBoxHeight, sizeScale, fontsVersion]);

	// --- Rich text editing on the canvas (double-click a text layer) ---
	const [isEditing, setIsEditing] = useState(false);
	const editorRef = useRef<HTMLDivElement | null>(null);
	const editPointRef = useRef<{ x: number; y: number } | null>(null);
		// A tap puts the caret at the tap point; a double-click selects the word there.
		const editSelectsWordRef = useRef(false);
		// Where the pointer went down, to tell a tap from a drag.
		const pressStartRef = useRef<{ x: number; y: number } | null>(null);
	// The runs last written by typing, and when: a keystroke soon after continues the same undo step.
	const lastEditRef = useRef<{ at: number; runs: string } | null>(null);
	const latestRef = useRef({ annotation, styledText, onTextEdit, onTextStyleApply, scale: sizeScale * liveFontScale });
	latestRef.current = { annotation, styledText, onTextEdit, onTextStyleApply, scale: sizeScale * liveFontScale };
	const textSelection = useTextSelection();
	const rememberedRange =
		textSelection && textSelection.annotationId === annotation.id ? textSelection : null;

	// Set when editing ends: the next single click only selects (it does not re-enter edit mode).
	const justLeftEditingRef = useRef(false);
	const stopEditing = () => {
		if (isEditing) justLeftEditingRef.current = true;
		setIsEditing(false);
		clearTextSelection(annotation.id);
		showRememberedSelection(null);
	};
	// Leaving the layer (deselected, or another layer selected) ends editing and its selection.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only the selection flag matters
	useEffect(() => {
		if (!isSelected && isEditing) stopEditing();
		if (!isSelected) {
			clearTextSelection(annotation.id);
			justLeftEditingRef.current = false;
		}
	}, [isSelected]);
	useEffect(() => {
		if (annotation.type !== "text" && isEditing) stopEditing();
	});

	// The editor's DOM is written here, never by React, so the caret and IME stay in our hands.
	const renderedRunsRef = useRef("");
	const renderEditor = (runs: typeof styledText.runs) => {
		const editor = editorRef.current;
		if (!editor) return;
		renderRunsInto(editor, runs);
		renderedRunsRef.current = JSON.stringify(runs);
	};
	// Entering edit mode: fill the editor, focus it and select the word that was double-clicked.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once per entry into edit mode
	useLayoutEffect(() => {
		const editor = editorRef.current;
		if (!isEditing || !editor) return;
		renderEditor(latestRef.current.styledText.runs);
		editor.focus({ preventScroll: true });
		const text = plainTextOf(runsOf(latestRef.current.annotation));
		const point = editPointRef.current;
		editPointRef.current = null;
		const caretRange =
			point && (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null })
				.caretRangeFromPoint?.(point.x, point.y);
		if (caretRange && editor.contains(caretRange.startContainer)) {
			const at = offsetOf(editor, caretRange.startContainer, caretRange.startOffset);
			let start = at;
			let end = at;
			if (editSelectsWordRef.current) {
				while (start > 0 && !/\s/.test(text[start - 1])) start--;
				while (end < text.length && !/\s/.test(text[end])) end++;
			}
			selectOffsets(editor, start, end);
		} else {
			selectOffsets(editor, text.length, text.length);
		}
	}, [isEditing]);
	// Runs changed from outside (panel, toolbar, undo): re-render, keeping the caret where it was.
	useLayoutEffect(() => {
		const editor = editorRef.current;
		if (!isEditing || !editor) return;
		if (renderedRunsRef.current === JSON.stringify(styledText.runs)) return;
		const caret = document.activeElement === editor ? selectedOffsets(editor) : null;
		renderEditor(styledText.runs);
		if (caret) {
			const length = plainTextOf(styledText.runs).length;
			selectOffsets(editor, Math.min(caret.start, length), Math.min(caret.end, length));
		}
	});
	// Typing, deleting, pasting and IME go through the run helpers, so styles stay attached.
	useEffect(() => {
		const editor = editorRef.current;
		if (!isEditing || !editor) return;
		const apply = (start: number, end: number, insert: string) => {
			const { annotation: current, onTextEdit: emit } = latestRef.current;
			if (start === end && !insert) return;
			const runs = runsOf(current);
			const next = editTextRuns(runs, start, end, insert, current.style);
			const now = Date.now();
			const last = lastEditRef.current;
			const continueBurst = Boolean(last && now - last.at < TYPING_BURST_MS && last.runs === JSON.stringify(runs));
			lastEditRef.current = { at: now, runs: JSON.stringify(next) };
			// Show the edit at once; the stored runs arrive with the next render and match.
			const shown = styledRunsOf({ ...current, content: plainTextOf(next), textRuns: next }, latestRef.current.scale);
			renderEditor(shown.runs);
			const caret = start + insert.length;
			selectOffsets(editor, caret, caret);
			emit?.(current.id, next, continueBurst);
		};
		const onBeforeInput = (event: InputEvent) => {
			const type = event.inputType;
			// An IME composition writes into the DOM itself; it is read back when it ends.
			if (event.isComposing || type.startsWith("insertComposition")) return;
			event.preventDefault();
			const text = plainTextOf(runsOf(latestRef.current.annotation));
			const selected = selectedOffsets(editor) ?? { start: text.length, end: text.length };
			let { start, end } = selected;
			const target = event.getTargetRanges?.()[0];
			const targetOffsets = target
				? {
						start: offsetOf(editor, target.startContainer, target.startOffset),
						end: offsetOf(editor, target.endContainer, target.endOffset),
					}
				: null;
			if (type === "insertParagraph" || type === "insertLineBreak") {
				apply(start, end, "\n");
			} else if (type.startsWith("insert")) {
				const data = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
				if (type === "insertReplacementText" && targetOffsets) ({ start, end } = targetOffsets);
				apply(start, end, data.replace(/\r\n?/g, "\n"));
			} else if (type.startsWith("delete")) {
				if (targetOffsets && targetOffsets.start !== targetOffsets.end) {
					({ start, end } = targetOffsets);
				} else if (start === end) {
					if (type.includes("Backward")) start = previousCodePoint(text, start);
					else end = nextCodePoint(text, end);
				}
				apply(Math.min(start, end), Math.max(start, end), "");
			}
			// Anything else (formatting, the browser's own undo) is not the editor's: bold/italic/
			// underline are handled on keydown, undo by the app's history.
		};
		const onCompositionEnd = () => {
			const before = plainTextOf(runsOf(latestRef.current.annotation));
			const edit = diffText(before, domText(editor));
			apply(edit.start, edit.end, edit.insert);
		};
		editor.addEventListener("beforeinput", onBeforeInput);
		editor.addEventListener("compositionend", onCompositionEnd);
		return () => {
			editor.removeEventListener("beforeinput", onBeforeInput);
			editor.removeEventListener("compositionend", onCompositionEnd);
		};
	}, [isEditing]);
	// Remember the selected range (panel and toolbar apply to it); a caret means no selection.
	useEffect(() => {
		if (!isEditing) return;
		const onSelectionChange = () => {
			const editor = editorRef.current;
			// Focus moved elsewhere (panel, popover): keep the remembered range.
			if (!editor || document.activeElement !== editor) return;
			const selected = selectedOffsets(editor);
			if (!selected) return;
			if (selected.start === selected.end) clearTextSelection(annotation.id);
			else setTextSelection({ annotationId: annotation.id, ...selected });
		};
		document.addEventListener("selectionchange", onSelectionChange);
		return () => document.removeEventListener("selectionchange", onSelectionChange);
	}, [isEditing, annotation.id]);
	// Keep the remembered range visible while the editor is not focused.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-anchored after every editor render
	useEffect(() => {
		const editor = editorRef.current;
		if (!isEditing || !editor) return;
		const update = () => {
			const range = rememberedRange && document.activeElement !== editor ? rememberedRange : null;
			showRememberedSelection(range ? rangeOf(editor, range.start, range.end) : null);
		};
		update();
		editor.addEventListener("focus", update);
		editor.addEventListener("blur", update);
		return () => {
			editor.removeEventListener("focus", update);
			editor.removeEventListener("blur", update);
		};
	}, [isEditing, rememberedRange?.start, rememberedRange?.end, styledText]);

	/** Ctrl/Cmd+B, I, U in the editor: toggle on the selection, or the whole layer for a caret. */
	const toggleTextStyle = (key: "fontWeight" | "fontStyle" | "textDecoration") => {
		const editor = editorRef.current;
		const { annotation: current, onTextStyleApply: applyStyle } = latestRef.current;
		if (!editor || !applyStyle) return;
		const runs = runsOf(current);
		const length = plainTextOf(runs).length;
		const selected = selectedOffsets(editor);
		const range = selected && selected.start !== selected.end ? selected : { start: 0, end: length };
		const summary = styleSummary(runs, current.style, range.start, range.end);
		const on = { fontWeight: "bold", fontStyle: "italic", textDecoration: "underline" } as const;
		const off = { fontWeight: "normal", fontStyle: "normal", textDecoration: "none" } as const;
		const isOn = summary[key] !== MIXED && summary[key] === on[key];
		applyStyle(current.id, { [key]: isOn ? off[key] : on[key] });
	};
	const onEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			stopEditing();
			return;
		}
		if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
			const key = event.key.toLowerCase();
			const style = key === "b" ? "fontWeight" : key === "i" ? "fontStyle" : key === "u" ? "textDecoration" : null;
			if (style) {
				event.preventDefault();
				event.stopPropagation();
				toggleTextStyle(style);
			}
		}
	};
	const onTextDoubleClick = (event: React.MouseEvent) => {
		if (annotation.type !== "text") return;
		const editor = editorRef.current;
		if (isEditing && editor) {
			// The second click of a double-click that started editing: select the word under it.
			const range = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null })
				.caretRangeFromPoint?.(event.clientX, event.clientY);
			if (!range || !editor.contains(range.startContainer)) return;
			const text = plainTextOf(runsOf(latestRef.current.annotation));
			const at = offsetOf(editor, range.startContainer, range.startOffset);
			let start = at;
			let end = at;
			while (start > 0 && !/\s/.test(text[start - 1])) start--;
			while (end < text.length && !/\s/.test(text[end])) end++;
			selectOffsets(editor, start, end);
			return;
		}
		if (!isSelected) return;
		event.stopPropagation();
		justLeftEditingRef.current = false;
		editPointRef.current = { x: event.clientX, y: event.clientY };
		editSelectsWordRef.current = true;
		lastEditRef.current = null;
		setIsEditing(true);
	};
		/** A tap (a click that did not move) on a text layer: select it, start editing, caret at the tap. */
		const onTextTap = (event: React.MouseEvent) => {
			const start = pressStartRef.current;
			pressStartRef.current = null;
			const action = decideTextClick({
				movedPx: start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) : 0,
				isSelected,
				isEditing,
				justLeftEditing: justLeftEditingRef.current,
			});
			if (action === "ignore") return;
			(onSelect ?? onClick)(annotation.id);
			justLeftEditingRef.current = false;
			if (action === "select") return;
			editPointRef.current = { x: event.clientX, y: event.clientY };
			editSelectsWordRef.current = false;
			lastEditRef.current = null;
			setIsEditing(true);
		};

	/**
	 * Runs the layer resize for the current pointer and modifiers and shows the result.
	 * react-resizable-box renders the box from its own pointer-only size, and react-rnd moves
	 * it with its own pointer-only position, each in a synchronous commit, so the box must be
	 * corrected in a synchronous commit too (flushSync). Left to React's normal scheduling,
	 * the correction lands a task later and the unmodified rect is painted for a frame.
	 */
	const applyResize = (
		pointer: { x: number; y: number },
		modifiers: { shift: boolean; alt: boolean },
	) => {
		const session = resizeSessionRef.current;
		if (!session) return;
		const zoom = interactionScale > 0 ? interactionScale : 1;
		const { rect, fontScale } = computeLayerResize({
			handle: session.handle,
			start: session.startRect,
			delta: {
				x: (pointer.x - session.startPointer.x) / zoom,
				y: (pointer.y - session.startPointer.y) / zoom,
			},
			modifiers,
			layerType: annotation.type,
			minSize: MIN_LAYER_SIZE_PX,
		});
		flushSync(() => {
			rndRef.current?.updatePosition({ x: rect.x, y: rect.y });
			rndRef.current?.updateSize({ width: rect.width, height: rect.height });
			setLiveResize({ rect, fontScale: annotation.type === "text" ? fontScale : 1 });
		});
	};

	const screenRectToRecordingPercent = (rect: Rect) => {
		const nextSceneX = (rect.x - sceneTransform.x) / sceneTransform.scale;
		const nextSceneY = (rect.y - sceneTransform.y) / sceneTransform.scale;
		const nextSceneWidth = rect.width / sceneTransform.scale;
		const nextSceneHeight = rect.height / sceneTransform.scale;
		const recordingWidth = Math.max(1, safeRecordingRect.width);
		const recordingHeight = Math.max(1, safeRecordingRect.height);

		const percentRect = {
			x: ((nextSceneX - safeRecordingRect.x) / recordingWidth) * 100,
			y: ((nextSceneY - safeRecordingRect.y) / recordingHeight) * 100,
			width: Math.max(0, (nextSceneWidth / recordingWidth) * 100),
			height: Math.max(0, (nextSceneHeight / recordingHeight) * 100),
		};
		// No canvas limit: layers may sit partly or fully outside; export crops them.
		const clamped = sanitizeRect(percentRect);

		return {
			position: { x: clamped.x, y: clamped.y },
			size: { width: clamped.width, height: clamped.height },
		};
	};

	const renderArrow = () => {
		const direction = annotation.figureData?.arrowDirection || "right";
		const color = annotation.figureData?.color || "#2563EB";
		const strokeWidth = annotation.figureData?.strokeWidth || 4;

		const ArrowComponent = getArrowComponent(direction);
		return <ArrowComponent color={color} strokeWidth={strokeWidth} />;
	};

	const renderContent = () => {
		switch (annotation.type) {
			case "text": {
				const hasBackground = hasTextBackground(annotation.style);
				// Lines and runs carry their own sizes; the block's size only sets the em insets.
				const textBlockStyle: React.CSSProperties = {
					flexShrink: 0,
					width: "100%",
					boxSizing: "border-box",
					padding: `${TEXT_INSET_Y_EM}em ${TEXT_INSET_X_EM}em`,
					fontSize: `${textFontSize}px`,
					textAlign: annotation.style.textAlign,
					lineHeight: String(TEXT_LINE_HEIGHT),
				};
				return (
					// The background fills the whole box (it resizes with it); lines come
					// from the same wrap as the export renderer (layoutTextBox).
					<div
						className="w-full h-full overflow-hidden"
						style={{
							display: "flex",
							flexDirection: "column",
							justifyContent: "center",
							boxSizing: "border-box",
							padding: `${TEXT_BOX_PADDING * sizeScale}px`,
							backgroundColor: hasBackground ? annotation.style.backgroundColor : undefined,
							borderRadius: hasBackground ? `${TEXT_BACKGROUND_RADIUS * sizeScale}px` : undefined,
						}}
					>
						{isEditing ? (
							// Edit mode: the browser wraps (pre-wrap) while typing; the DOM is written by
							// renderEditor from the runs, never by React.
							// Its own key: React must not reuse this node for the display block, whose
							// children it manages (the editor's are written imperatively).
							<div
								key="rich-text-editor"
								ref={editorRef}
								contentEditable
								data-rich-text-editor
								role="textbox"
								aria-multiline
								spellCheck={false}
								onKeyDown={onEditorKeyDown}
								onMouseDown={(event) => event.stopPropagation()}
								onClick={(event) => event.stopPropagation()}
								style={{
									...textBlockStyle,
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere",
									outline: "none",
									cursor: "text",
									userSelect: "text",
									WebkitUserSelect: "text",
									color: styledText.base.color,
									caretColor: styledText.base.color,
								}}
							/>
						) : (
							<div key="rich-text-display" style={textBlockStyle}>
								{(textLayout?.lines ?? []).map((line, index) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity beyond their order.
									<div key={index} style={{ whiteSpace: "pre", fontSize: 0 }}>
										{line.pieces.length > 0 ? (
											line.pieces.map((piece, pieceIndex) => (
												// biome-ignore lint/suspicious/noArrayIndexKey: pieces have no identity beyond their order.
												<span key={pieceIndex} style={runCss(piece.style)}>
													{piece.text}
												</span>
											))
										) : (
											<span style={runCss(line.style)}>{"​"}</span>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				);
			}

			case "image":
				if (annotation.content && annotation.content.startsWith("data:image")) {
					return (
						<img
							src={annotation.content}
							alt="Annotation"
							className="w-full h-full object-contain"
							draggable={false}
						/>
					);
				}
				return (
					<div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
						No image
					</div>
				);

			case "figure":
				if (!annotation.figureData) {
					return (
						<div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
							No arrow data
						</div>
					);
				}

				return (
					<div
						className="w-full h-full flex items-center justify-center"
						style={{ padding: `${8 * sizeScale}px` }}
					>
						{renderArrow()}
					</div>
				);

			case "shape": {
				const shape = annotation.shapeData ?? DEFAULT_SHAPE_DATA;
				const strokePx = shape.strokeWidth * sizeScale;
				return (
					<div
						className="h-full w-full"
						style={{
							backgroundColor: shape.fillColor,
							border:
								shape.strokeWidth > 0
									? `${strokePx}px solid ${shape.strokeColor}`
									: undefined,
							borderRadius:
								shape.kind === "ellipse"
									? "50%"
									: `${shape.cornerRadius * sizeScale}px`,
							boxSizing: "border-box",
						}}
					/>
				);
			}

			case "blur": {
				const currentBlurStrength = annotation.blurIntensity ?? BLUR_ANNOTATION_STRENGTH;
				const blurPx = currentBlurStrength * blurScaleFactor;
				const blurStyle = `blur(${blurPx}px)`;

				return (
					<div
						className="h-full w-full bg-slate-400/10"
						style={{
							backdropFilter: blurStyle,
							WebkitBackdropFilter: blurStyle,
							backgroundColor: annotation.blurColor || "transparent",
							borderRadius: `${(annotation.style.borderRadius ?? 0) * blurScaleFactor}px`,
						}}
					/>
				);
			}

			default:
				return null;
		}
	};

	return (
		<Rnd
			ref={rndRef}
			position={{ x: displayRect.x, y: displayRect.y }}
			size={{ width: displayRect.width, height: displayRect.height }}
			scale={interactionScale}
			minWidth={MIN_LAYER_SIZE_PX}
			minHeight={MIN_LAYER_SIZE_PX}
			onDragStart={() => {
				isDraggingRef.current = true;
			}}
			onDragStop={(_e, d) => {
				const next = screenRectToRecordingPercent({ x: d.x, y: d.y, width, height });
				onPositionChange(annotation.id, next.position);

				// Reset dragging flag after a short delay to prevent click event
				setTimeout(() => {
					isDraggingRef.current = false;
				}, 100);
			}}
			// react-rnd supplies the handle and the pointer; the rect comes from
			// computeLayerResize (edges move one edge, corners keep the ratio, Shift
			// frees it, Alt resizes from the centre) and is pushed back into Rnd.
			onResizeStart={(e, direction) => {
				// A resize that ends inside the box fires a click; like a drag, it must
				// not count as a click (which would cycle the selection).
				isDraggingRef.current = true;
				const handle = handleFromRndDirection(direction);
				const pointer = pointerOf(e);
				resizeSessionRef.current =
					handle && pointer
						? {
								handle,
								startRect: { x, y, width, height },
								startPointer: pointer,
								lastPointer: pointer,
							}
						: null;
				// Pressing or releasing Shift/Alt mid-drag re-runs the resize at once instead of
				// waiting for the next pointer move.
				stopModifierWatchRef.current?.();
				const onKey = (keyEvent: KeyboardEvent) => {
					const active = resizeSessionRef.current;
					if (!active || (keyEvent.key !== "Shift" && keyEvent.key !== "Alt")) return;
					applyResize(active.lastPointer, { shift: keyEvent.shiftKey, alt: keyEvent.altKey });
				};
				window.addEventListener("keydown", onKey);
				window.addEventListener("keyup", onKey);
				stopModifierWatchRef.current = () => {
					window.removeEventListener("keydown", onKey);
					window.removeEventListener("keyup", onKey);
					stopModifierWatchRef.current = null;
				};
			}}
			onResize={(e) => {
				const session = resizeSessionRef.current;
				const pointer = pointerOf(e);
				if (!session || !pointer) return;
				session.lastPointer = pointer;
				applyResize(pointer, modifiersOf(e));
			}}
			onResizeStop={() => {
				const result = liveResizeRef.current;
				resizeSessionRef.current = null;
				stopModifierWatchRef.current?.();
				setLiveResize(null);
				setTimeout(() => {
					isDraggingRef.current = false;
				}, 100);
				if (!result) return;
				// Position, size and font change together: one undo step.
				const next = screenRectToRecordingPercent(result.rect);
				const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
				// Every text size (layer and runs) scales by the same factor, rounded to whole pixels.
				const scaled = annotation.type === "text" ? scaleTextLayer(annotation, result.fontScale) : null;
				const fontChanged =
					scaled !== null &&
					(scaled.style.fontSize !== annotation.style.fontSize ||
						JSON.stringify(scaled.textRuns) !== JSON.stringify(annotation.textRuns));
				const unchanged =
					close(next.position.x, annotation.position.x) &&
					close(next.position.y, annotation.position.y) &&
					close(next.size.width, annotation.size.width) &&
					close(next.size.height, annotation.size.height) &&
					!fontChanged;
				if (unchanged) return;
				setPendingResize(result);
				onPositionChange(annotation.id, next.position);
				onSizeChange(annotation.id, next.size);
				if (fontChanged) {
					if (onTextScale) onTextScale(annotation.id, result.fontScale);
					else onStyleChange?.(annotation.id, { fontSize: scaled.style.fontSize });
				}
			}}
			onMouseDown={(event: MouseEvent) => {
				pressStartRef.current = { x: event.clientX, y: event.clientY };
			}}
			onClick={(event: React.MouseEvent) => {
				// While editing text, clicks place the caret; they must not cycle the selection.
				if (isDraggingRef.current || isEditing) return;
				if (annotation.type === "text") {
					onTextTap(event);
					return;
				}
				onClick(annotation.id);
			}}
			// No transition on size or position: react-rnd measures the box while a
			// resize runs, and an animating box made it misplace the edges.
			className={cn(
				"cursor-move transition-[background-color,border-color,box-shadow]",
				isSelected && "ring-2 ring-[#2563EB] ring-offset-2 ring-offset-transparent",
			)}
			style={{
				zIndex: isSelectedBoost ? zIndex + 1000 : zIndex, // Boost selected annotation to ensure it's on top
				pointerEvents: "auto",
				border: isSelected ? "2px solid rgba(37, 99, 235, 0.8)" : "none",
				backgroundColor: isSelected ? "rgba(37, 99, 235, 0.1)" : "transparent",
				boxShadow: isSelected ? "0 0 0 1px rgba(37, 99, 235, 0.35)" : "none",
			}}
			enableResizing={isSelected}
			// While editing text, a drag selects text instead of moving the layer.
			disableDragging={!isSelected}
			// While editing, dragging from the box's border or padding still moves the layer; a press on
			// the text itself places the caret or selects text.
			cancel={isEditing ? "[data-rich-text-editor]" : undefined}
			resizeHandleStyles={{
				topLeft: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #2563EB" : "none",
					borderRadius: "50%",
					left: "-6px",
					top: "-6px",
					cursor: "nwse-resize",
				},
				topRight: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #2563EB" : "none",
					borderRadius: "50%",
					right: "-6px",
					top: "-6px",
					cursor: "nesw-resize",
				},
				bottomLeft: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #2563EB" : "none",
					borderRadius: "50%",
					left: "-6px",
					bottom: "-6px",
					cursor: "nesw-resize",
				},
				bottomRight: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #2563EB" : "none",
					borderRadius: "50%",
					right: "-6px",
					bottom: "-6px",
					cursor: "nwse-resize",
				},
			}}
		>
			<div
				onDoubleClick={onTextDoubleClick}
				className={cn(
					"w-full h-full rounded-lg",
					annotation.type === "text" && "bg-transparent",
					annotation.type === "image" && "bg-transparent",
					annotation.type === "figure" && "bg-transparent",
					annotation.type === "shape" && "bg-transparent",
					isSelected && "shadow-lg",
				)}
			>
				{renderContent()}
			</div>
		</Rnd>
	);
}
