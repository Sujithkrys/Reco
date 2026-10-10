import { useRef } from "react";
import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import {
	clampEdgesToCanvas,
	clampMoveToCanvas,
	getCanvasBoundsPercent,
} from "./annotationCanvasBounds";
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
	canvasWidth: number;
	canvasHeight: number;
	videoRectX: number;
	videoRectY: number;
	recordingRect: Rect;
	sceneTransform: SceneTransform;
	interactionScale?: number;
	onPositionChange: (id: string, position: { x: number; y: number }) => void;
	onSizeChange: (id: string, size: { width: number; height: number }) => void;
	onClick: (id: string) => void;
	zIndex: number;
	isSelectedBoost: boolean; // Boost z-index when selected for easy editing
}

/** Render an annotation in preview space with editor drag and resize controls. */
export function AnnotationOverlay({
	annotation,
	isSelected,
	containerWidth,
	containerHeight,
	canvasWidth,
	canvasHeight,
	videoRectX,
	videoRectY,
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

	const screenRectToRecordingPercent = (rect: Rect, mode: "move" | "resize") => {
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
		// Bounds are the full outer canvas expressed in recording-rect percent, so
		// positions can go below 0 / above 100 while the whole layer stays on canvas.
		const bounds = getCanvasBoundsPercent(
			{ x: videoRectX, y: videoRectY, width: recordingWidth, height: recordingHeight },
			canvasWidth,
			canvasHeight,
		);
		// Moving keeps the size; resizing stops each dragged edge at the canvas edge.
		const clamped =
			mode === "move"
				? clampMoveToCanvas(percentRect, bounds)
				: clampEdgesToCanvas(percentRect, bounds);

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
			case "text":
				return (
					<div
						className="w-full h-full flex items-center overflow-hidden"
						style={{
							justifyContent:
								annotation.style.textAlign === "left"
									? "flex-start"
									: annotation.style.textAlign === "right"
										? "flex-end"
										: "center",
							alignItems: "center",
							padding: `${8 * sizeScale}px`,
						}}
					>
						<span
							style={{
								color: annotation.style.color,
								backgroundColor: annotation.style.backgroundColor,
								fontSize: `${annotation.style.fontSize * sizeScale}px`,
								fontFamily: annotation.style.fontFamily,
								fontWeight: annotation.style.fontWeight,
								fontStyle: annotation.style.fontStyle,
								textDecoration: annotation.style.textDecoration,
								textAlign: annotation.style.textAlign,
								wordBreak: "break-word",
								whiteSpace: "pre-wrap",
								boxDecorationBreak: "clone",
								WebkitBoxDecorationBreak: "clone",
								padding: "0.1em 0.2em",
								borderRadius: `${4 * sizeScale}px`,
								lineHeight: "1.4",
							}}
						>
							{annotation.content}
						</span>
					</div>
				);

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
				const next = screenRectToRecordingPercent({ x: d.x, y: d.y, width, height }, "move");
				onPositionChange(annotation.id, next.position);

				// Reset dragging flag after a short delay to prevent click event
				setTimeout(() => {
					isDraggingRef.current = false;
				}, 100);
			}}
			onResizeStop={(_e, _direction, ref, _delta, position) => {
				const next = screenRectToRecordingPercent(
					{
						x: position.x,
						y: position.y,
						width: ref.offsetWidth,
						height: ref.offsetHeight,
					},
					"resize",
				);
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
