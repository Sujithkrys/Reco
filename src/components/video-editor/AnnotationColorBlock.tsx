import Block from "@uiw/react-color-block";
import { type MouseEvent, useEffect, useRef } from "react";
import { ColorEyedropperButton } from "./ColorEyedropperButton";

interface AnnotationColorBlockProps {
	color: string;
	colors: string[];
	/** Applies the colour for real (an undoable edit). */
	onChange: (hex: string) => void;
	/** Hover preview: the swatch colour under the pointer, or null when the pointer leaves. */
	onPreview?: (hex: string | null) => void;
	className?: string;
}

/** Hex of the preset swatch under the pointer, if the target is one (not the big preview or the hex field). */
export function getSwatchHex(target: EventTarget | null): string | null {
	if (!(target instanceof Element)) return null;
	const swatch = target.closest(".w-color-swatch > div");
	const hex = swatch?.getAttribute("title");
	return hex || null;
}

/** Colour swatches plus an eyedropper; hovering a swatch only previews it, clicking applies it. */
export function AnnotationColorBlock({
	color,
	colors,
	onChange,
	onPreview,
	className,
}: AnnotationColorBlockProps) {
	const previewRef = useRef(onPreview);
	previewRef.current = onPreview;
	// Closing the popover (or switching layers) unmounts this: drop any preview.
	useEffect(() => () => previewRef.current?.(null), []);

	const apply = (hex: string) => {
		onPreview?.(null);
		onChange(hex);
	};

	return (
		<div
			className={className}
			onMouseOver={(event: MouseEvent) => onPreview?.(getSwatchHex(event.target))}
			onMouseLeave={() => onPreview?.(null)}
		>
			<Block
				color={color}
				colors={colors}
				onChange={(value) => apply(value.hex)}
				style={{ borderRadius: "8px", width: "100%" }}
			/>
			<div className="mt-2 flex justify-end">
				<ColorEyedropperButton onPick={apply} />
			</div>
		</div>
	);
}
