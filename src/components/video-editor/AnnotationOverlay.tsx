import { useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import { sanitizeRect } from "./annotationCanvasBounds";
import {
	computeLayerResize,
	handleFromRndDirection,
	type ResizeHandle,
	scaleTextFontSize,
} from "./annotationResize";
import {
	hasTextBackground,
	layoutTextBox,
	TEXT_BACKGROUND_RADIUS,
	TEXT_BOX_PADDING,
	TEXT_INSET_X_EM,
	TEXT_INSET_Y_EM,
	TEXT_LINE_HEIGHT,
	textLayerFont,
} from "./annotationTextLayout";
import { getArrowComponent } from "./ArrowSvgs";
import {
	type AnnotationRegion,
	BASE_PREVIEW_WIDTH,
	BLUR_ANNOTATION_STRENGTH,
	DEFAULT_SHAPE_DATA,
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
	onClick: (id: string) => void;
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
	onClick,
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
	} | null>(null);
	const [liveResize, setLiveResizeState] = useState<{ rect: Rect; fontSize: number } | null>(null);
	// Mirrors liveResize so onResizeStop always sees the last move, even before a re-render.
	const liveResizeRef = useRef<{ rect: Rect; fontSize: number } | null>(null);
	const setLiveResize = (value: { rect: Rect; fontSize: number } | null) => {
		liveResizeRef.current = value;
		setLiveResizeState(value);
	};
	// The committed result, shown until the stored position/size catch up so the
	// box never snaps back for a frame after the drag ends.
	const [pendingResize, setPendingResize] = useState<{ rect: Rect; fontSize: number } | null>(
		null,
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: any change to the stored rect or font supersedes the pending one
	useEffect(() => {
		setPendingResize(null);
	}, [
		annotation.position.x,
		annotation.position.y,
		annotation.size.width,
		annotation.size.height,
		annotation.style.fontSize,
		safeRecordingRect.width,
		safeRecordingRect.height,
	]);
	const displayed = liveResize ?? pendingResize;
	const displayRect = displayed?.rect ?? { x, y, width, height };
	const fontsVersion = useFontsVersion();
	const textFontSize = (displayed?.fontSize ?? annotation.style.fontSize) * sizeScale;
	const textBoxWidth = displayRect.width;
	const textBoxHeight = displayRect.height;
	const textLines = useMemo(() => {
		if (annotation.type !== "text") return [];
		const ctx = getMeasureContext();
		const content = annotation.content || "";
		if (!ctx) return content.split("\n");
		ctx.font = textLayerFont(annotation.style, textFontSize);
		return layoutTextBox(
			(text) => ctx.measureText(text).width,
			content,
			annotation.style.textAlign,
			{ x: 0, y: 0, width: textBoxWidth, height: textBoxHeight, fontSize: textFontSize, scale: sizeScale },
		).lines;
		// fontsVersion re-measures once web fonts finish loading.
	}, [
		annotation.type,
		annotation.content,
		annotation.style,
		textFontSize,
		textBoxWidth,
		textBoxHeight,
		sizeScale,
		fontsVersion,
	]);

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
						<div
							style={{
								flexShrink: 0,
								width: "100%",
								boxSizing: "border-box",
								padding: `${TEXT_INSET_Y_EM}em ${TEXT_INSET_X_EM}em`,
								color: annotation.style.color,
								fontSize: `${textFontSize}px`,
								fontFamily: annotation.style.fontFamily,
								fontWeight: annotation.style.fontWeight,
								fontStyle: annotation.style.fontStyle,
								textDecoration: annotation.style.textDecoration,
								textAlign: annotation.style.textAlign,
								lineHeight: String(TEXT_LINE_HEIGHT),
							}}
						>
							{textLines.map((line, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity beyond their order.
								<div key={index} style={{ whiteSpace: "pre" }}>
									{line || "​"}
								</div>
							))}
						</div>
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
						? { handle, startRect: { x, y, width, height }, startPointer: pointer }
						: null;
			}}
			onResize={(e) => {
				const session = resizeSessionRef.current;
				const pointer = pointerOf(e);
				if (!session || !pointer) return;
				const zoom = interactionScale > 0 ? interactionScale : 1;
				const { rect, fontScale } = computeLayerResize({
					handle: session.handle,
					start: session.startRect,
					delta: {
						x: (pointer.x - session.startPointer.x) / zoom,
						y: (pointer.y - session.startPointer.y) / zoom,
					},
					modifiers: modifiersOf(e),
					layerType: annotation.type,
					minSize: MIN_LAYER_SIZE_PX,
				});
				rndRef.current?.updatePosition({ x: rect.x, y: rect.y });
				rndRef.current?.updateSize({ width: rect.width, height: rect.height });
				setLiveResize({
					rect,
					fontSize:
						annotation.type === "text"
							? scaleTextFontSize(annotation.style.fontSize, fontScale)
							: annotation.style.fontSize,
				});
			}}
			onResizeStop={() => {
				const result = liveResizeRef.current;
				resizeSessionRef.current = null;
				setLiveResize(null);
				setTimeout(() => {
					isDraggingRef.current = false;
				}, 100);
				if (!result) return;
				// Position, size and font change together: one undo step.
				const next = screenRectToRecordingPercent(result.rect);
				const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
				const unchanged =
					close(next.position.x, annotation.position.x) &&
					close(next.position.y, annotation.position.y) &&
					close(next.size.width, annotation.size.width) &&
					close(next.size.height, annotation.size.height) &&
					result.fontSize === annotation.style.fontSize;
				if (unchanged) return;
				setPendingResize(result);
				onPositionChange(annotation.id, next.position);
				onSizeChange(annotation.id, next.size);
				if (annotation.type === "text" && result.fontSize !== annotation.style.fontSize) {
					onStyleChange?.(annotation.id, { fontSize: result.fontSize });
				}
			}}
			onClick={() => {
				if (isDraggingRef.current) return;
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
			disableDragging={!isSelected}
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
