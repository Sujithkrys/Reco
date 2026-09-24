import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { type AspectRatio } from "@/utils/aspectRatioUtils";

interface CropRegion {
	x: number; // 0-1 normalized
	y: number; // 0-1 normalized
	width: number; // 0-1 normalized
	height: number; // 0-1 normalized
}

interface CropControlProps {
	videoElement: HTMLVideoElement | null;
	cropRegion: CropRegion;
	onCropChange: (region: CropRegion) => void;
	aspectRatio: AspectRatio;
}

type DragHandle = "top" | "right" | "bottom" | "left" | null;

export function CropControl({ videoElement, cropRegion, onCropChange }: CropControlProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState<DragHandle>(null);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [initialCrop, setInitialCrop] = useState<CropRegion>(cropRegion);
	const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });

	// CSS aspect-ratio + max-width/max-height auto-fit sizing doesn't reliably
	// "contain" a flex item the way object-fit does on a replaced element —
	// it previously let the crop box size itself taller than the space this
	// dialog actually has, pushing the drag handles below the dialog's own
	// clipped area. A mousedown there landed on the backdrop instead of a
	// handle and closed the whole editor. Measuring the real available box
	// and computing an explicit pixel size removes the ambiguity.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const update = () => {
			const rect = wrapper.getBoundingClientRect();
			setWrapperSize({ width: rect.width, height: rect.height });
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(wrapper);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!videoElement || !canvasRef.current) return;

		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d", { alpha: false });
		if (!ctx) return;

		canvas.width = videoElement.videoWidth || 1920;
		canvas.height = videoElement.videoHeight || 1080;

		let animationFrameId = 0;
		let isCancelled = false;

		const draw = () => {
			if (isCancelled) {
				return;
			}

			if (videoElement.readyState >= 2) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
			}
			animationFrameId = requestAnimationFrame(draw);
		};

		animationFrameId = requestAnimationFrame(draw);
		return () => {
			isCancelled = true;
			cancelAnimationFrame(animationFrameId);
		};
	}, [videoElement]);

	const getContainerRect = () => {
		return (
			containerRef.current?.getBoundingClientRect() || {
				width: 0,
				height: 0,
				left: 0,
				top: 0,
			}
		);
	};

	const handlePointerDown = (e: React.PointerEvent, handle: DragHandle) => {
		e.stopPropagation();
		e.preventDefault();
		const rect = getContainerRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}

		setIsDragging(handle);
		setDragStart({
			x: (e.clientX - rect.left) / rect.width,
			y: (e.clientY - rect.top) / rect.height,
		});
		setInitialCrop(cropRegion);

		e.currentTarget.setPointerCapture(e.pointerId);
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (!isDragging) return;

		const rect = getContainerRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}

		const currentX = (e.clientX - rect.left) / rect.width;
		const currentY = (e.clientY - rect.top) / rect.height;
		const deltaX = currentX - dragStart.x;
		const deltaY = currentY - dragStart.y;

		let newCrop = { ...initialCrop };

		switch (isDragging) {
			case "top": {
				const newY = Math.max(0, initialCrop.y + deltaY);
				const bottom = initialCrop.y + initialCrop.height;
				newCrop.y = Math.min(newY, bottom - 0.1);
				newCrop.height = bottom - newCrop.y;
				break;
			}
			case "bottom":
				newCrop.height = Math.max(
					0.1,
					Math.min(initialCrop.height + deltaY, 1 - initialCrop.y),
				);
				break;
			case "left": {
				const newX = Math.max(0, initialCrop.x + deltaX);
				const right = initialCrop.x + initialCrop.width;
				newCrop.x = Math.min(newX, right - 0.1);
				newCrop.width = right - newCrop.x;
				break;
			}
			case "right":
				newCrop.width = Math.max(
					0.1,
					Math.min(initialCrop.width + deltaX, 1 - initialCrop.x),
				);
				break;
		}

		onCropChange(newCrop);
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		if (isDragging) {
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* Pointer capture may already be released while ending the drag. */
			}
		}
		setIsDragging(null);
	};

	const cropPixelX = cropRegion.x * 100;
	const cropPixelY = cropRegion.y * 100;
	const cropPixelWidth = cropRegion.width * 100;
	const cropPixelHeight = cropRegion.height * 100;
	const videoAspectRatio = videoElement
		? videoElement.videoWidth / videoElement.videoHeight
		: 16 / 9;

	// Fit the aspect-ratio box within the measured wrapper, like object-fit:
	// contain — whichever axis is more constraining determines the size.
	let fittedWidth = wrapperSize.width;
	let fittedHeight = wrapperSize.height;
	if (wrapperSize.width > 0 && wrapperSize.height > 0) {
		if (wrapperSize.width / wrapperSize.height > videoAspectRatio) {
			fittedHeight = wrapperSize.height;
			fittedWidth = fittedHeight * videoAspectRatio;
		} else {
			fittedWidth = wrapperSize.width;
			fittedHeight = fittedWidth / videoAspectRatio;
		}
	}

	return (
		<div ref={wrapperRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-8">
			<div
				ref={containerRef}
				className="relative bg-black rounded-lg overflow-visible cursor-default select-none shadow-2xl"
				style={{
					// An explicit measured pixel size (see the ResizeObserver above)
					// instead of CSS aspect-ratio auto-fit, which doesn't reliably
					// "contain" a flex item the way object-fit does on a replaced
					// element — it previously let this box size itself taller than
					// the dialog actually has room for, pushing the drag handles past
					// the dialog's own clipped, hit-testable area. A mousedown meant
					// for the bottom handle would land on the backdrop instead and
					// close the whole editor.
					width: fittedWidth > 0 ? fittedWidth : "100%",
					height: fittedHeight > 0 ? fittedHeight : "auto",
					aspectRatio: videoAspectRatio,
				}}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerLeave={handlePointerUp}
			>
				<canvas
					ref={canvasRef}
					className="w-full h-full rounded-lg"
					style={{ imageRendering: "auto" }}
				/>

				<div
					className="absolute inset-0 pointer-events-none"
					style={{ transition: "none" }}
				>
					<svg
						width="100%"
						height="100%"
						className="absolute inset-0"
						style={{ transition: "none" }}
					>
						<defs>
							<mask id="cropMask">
								<rect width="100%" height="100%" fill="white" />
								<rect
									x={`${cropPixelX}%`}
									y={`${cropPixelY}%`}
									width={`${cropPixelWidth}%`}
									height={`${cropPixelHeight}%`}
									fill="black"
									style={{ transition: "none" }}
								/>
							</mask>
						</defs>
						<rect
							width="100%"
							height="100%"
							fill="black"
							fillOpacity="0.6"
							mask="url(#cropMask)"
							style={{ transition: "none" }}
						/>
					</svg>
				</div>

				<div
					className={cn(
						"absolute h-[3px] cursor-ns-resize z-20 pointer-events-auto bg-[#2563EB]",
					)}
					style={{
						left: `${cropPixelX}%`,
						top: `${cropPixelY}%`,
						width: `${cropPixelWidth}%`,
						transform: "translateY(-50%)",
						willChange: "transform",
						transition: "none",
					}}
					onPointerDown={(e) => handlePointerDown(e, "top")}
				/>

				<div
					className={cn(
						"absolute h-[3px] cursor-ns-resize z-20 pointer-events-auto bg-[#2563EB]",
					)}
					style={{
						left: `${cropPixelX}%`,
						top: `${cropPixelY + cropPixelHeight}%`,
						width: `${cropPixelWidth}%`,
						transform: "translateY(-50%)",
						willChange: "transform",
						transition: "none",
					}}
					onPointerDown={(e) => handlePointerDown(e, "bottom")}
				/>

				<div
					className={cn(
						"absolute w-[3px] cursor-ew-resize z-20 pointer-events-auto bg-[#2563EB]",
					)}
					style={{
						left: `${cropPixelX}%`,
						top: `${cropPixelY}%`,
						height: `${cropPixelHeight}%`,
						transform: "translateX(-50%)",
						willChange: "transform",
						transition: "none",
					}}
					onPointerDown={(e) => handlePointerDown(e, "left")}
				/>

				<div
					className={cn(
						"absolute w-[3px] cursor-ew-resize z-20 pointer-events-auto bg-[#2563EB]",
					)}
					style={{
						left: `${cropPixelX + cropPixelWidth}%`,
						top: `${cropPixelY}%`,
						height: `${cropPixelHeight}%`,
						transform: "translateX(-50%)",
						willChange: "transform",
						transition: "none",
					}}
					onPointerDown={(e) => handlePointerDown(e, "right")}
				/>
			</div>
		</div>
	);
}
