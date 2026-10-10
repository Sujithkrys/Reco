import { useEffect, useRef } from "react";
import { ColorPicker } from "./ColorPicker";

interface AnnotationColorBlockProps {
	color: string;
	colors: string[];
	/** Applies the colour for real (one undo step per gesture). */
	onChange: (hex: string) => void;
	/** Hover / drag preview: the colour under the pointer, or null when it ends. */
	onPreview?: (hex: string | null) => void;
	projectColors?: string[];
	/** For fields that allow "no fill" (text background, blur colour). */
	onClear?: () => void;
	clearLabel?: string;
}

/** The editor colour picker wired for a layer colour; the preview is dropped when it unmounts. */
export function AnnotationColorBlock({
	color,
	colors,
	onChange,
	onPreview,
	projectColors,
	onClear,
	clearLabel,
}: AnnotationColorBlockProps) {
	const previewRef = useRef(onPreview);
	previewRef.current = onPreview;
	// Closing the popover (or switching layers) unmounts this: drop any preview.
	useEffect(() => () => previewRef.current?.(null), []);

	return (
		<ColorPicker
			value={color}
			presets={colors}
			projectColors={projectColors}
			onChange={onChange}
			onPreview={onPreview}
			onClear={onClear}
			clearLabel={clearLabel}
		/>
	);
}
