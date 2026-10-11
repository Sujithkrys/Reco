import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorPicker } from "./ColorPicker";

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
			<PopoverContent className="w-[260px] p-3 bg-editor-surface-alt border border-foreground/10 rounded-xl shadow-xl">
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
