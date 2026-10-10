import { Eyedropper } from "@phosphor-icons/react";
import type { MouseEvent } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { useScopedT } from "../../contexts/I18nContext";
import { cn } from "@/lib/utils";

interface EyeDropperResult {
	sRGBHex: string;
}

interface EyeDropperApi {
	open: (options?: { signal?: AbortSignal }) => Promise<EyeDropperResult>;
}

type EyeDropperConstructor = new () => EyeDropperApi;

function getEyeDropper(): EyeDropperConstructor | undefined {
	if (typeof window === "undefined") return undefined;
	return (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
}

export function isEyedropperSupported() {
	return typeof getEyeDropper() === "function";
}

/** Opens the browser picker and reports the chosen colour as lowercase #rrggbb; Escape or no API does nothing. */
export async function pickColorWithEyedropper(onPick: (hex: string) => void) {
	const EyeDropper = getEyeDropper();
	if (!EyeDropper) return;
	try {
		const result = await new EyeDropper().open();
		if (result?.sRGBHex) onPick(result.sRGBHex.toLowerCase());
	} catch {
		// Escape or a blocked picker: keep the current colour.
	}
}

interface ColorEyedropperButtonProps {
	/** Called with the picked colour as a lowercase #rrggbb string. */
	onPick: (hex: string) => void;
	className?: string;
}

/** Picks a colour from anywhere on screen (the canvas included). Renders nothing where the browser has no EyeDropper API. */
export function ColorEyedropperButton({ onPick, className }: ColorEyedropperButtonProps) {
	const t = useScopedT("editor");
	const EyeDropper = getEyeDropper();
	if (!EyeDropper) return null;

	const label = t("annotations.pickColorFromScreen", "Pick a colour from the screen");
	const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
		// Inside a <label> this would otherwise also open the colour input.
		event.preventDefault();
		void pickColorWithEyedropper(onPick);
	};

	return (
		<Tooltip content={label} asChild>
			<button
				type="button"
				onClick={handleClick}
				aria-label={label}
				className={cn(
					"flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-foreground/10 bg-foreground/5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
					className,
				)}
			>
				<Eyedropper className="h-4 w-4" />
			</button>
		</Tooltip>
	);
}
