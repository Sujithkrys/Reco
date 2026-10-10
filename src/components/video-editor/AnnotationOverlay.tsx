import { useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import { sanitizeRect } from "./annotationCanvasBounds";
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
	// While a resize is in progress the box is wider/narrower than the stored
	// size; wrap text to the live size so it reflows as the box moves.
	const [liveSize, setLiveSize] = useState<{ width: number; height: number } | null>(null);
	const fontsVersion = useFontsVersion();
	const textFontSize = annotation.style.fontSize * sizeScale;
	const textBoxWidth = liveSize?.width ?? width;
	const textBoxHeight = liveSize?.height ?? height;
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
			position={{ x, y }}
			size={{ width, height }}
			scale={interactionScale}
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
			onResize={(_e, _direction, ref) => {
				if (annotation.type === "text") {
					setLiveSize({ width: ref.offsetWidth, height: ref.offsetHeight });
				}
			}}
			onResizeStop={(_e, _direction, ref, _delta, position) => {
				setLiveSize(null);
				const next = screenRectToRecordingPercent({
					x: position.x,
					y: position.y,
					width: ref.offsetWidth,
					height: ref.offsetHeight,
				});
				onPositionChange(annotation.id, next.position);
				onSizeChange(annotation.id, next.size);
			}}
			onClick={() => {
				if (isDraggingRef.current) return;
				onClick(annotation.id);
			}}
			className={cn(
				"cursor-move transition-all",
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
