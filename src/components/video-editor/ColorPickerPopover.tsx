import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorPicker } from "./ColorPicker";

/**
 * Collision handling for every popover that holds the colour picker: it flips to the other side,
 * shifts to stay inside the window (12px margin), and never grows past the room it has, scrolling
 * inside instead.
 */
export const COLOR_PICKER_POPOVER_PROPS = {
	collisionPadding: 12,
	avoidCollisions: true,
	sticky: "always",
	className:
		"w-[260px] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-3 bg-editor-surface-alt border border-foreground/10 rounded-xl shadow-xl",
} as const;

interface ColorPickerPopoverProps {
	value: string;
	onChange: (hex: string) => void;
	presets: string[];
	projectColors?: string[];
	/** Hover / drag preview (a colour, or null when it ends). */
	onPreview?: (hex: string | null) => void;
	/** The element that opens the picker. */
	trigger: ReactNode;
}

/** A trigger that opens the shared colour picker in the editor's usual popover. */
export function ColorPickerPopover({
	value,
	onChange,
	presets,
	projectColors,
	onPreview,
	trigger,
}: ColorPickerPopoverProps) {
	return (
		<Popover>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent {...COLOR_PICKER_POPOVER_PROPS}>
				<ColorPicker
					value={value}
					presets={presets}
					projectColors={projectColors}
					onChange={onChange}
					onPreview={onPreview}
				/>
			</PopoverContent>
		</Popover>
	);
}
