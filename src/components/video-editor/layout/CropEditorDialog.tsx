import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { useI18n } from "@/contexts/I18nContext";
import type { AspectRatio } from "@/utils/aspectRatioUtils";
import { CropControl } from "../CropControl";
import type { CropRegion } from "../types";

type Props = {
	open: boolean;
	t: ReturnType<typeof useI18n>["t"];
	videoElement: HTMLVideoElement | null;
	cropRegion: CropRegion;
	setCropRegion: Dispatch<SetStateAction<CropRegion>>;
	aspectRatio: AspectRatio;
	onCancel: () => void;
	onDone: () => void;
};

export function CropEditorDialog({
	open,
	t,
	videoElement,
	cropRegion,
	setCropRegion,
	aspectRatio,
	onCancel,
	onDone,
}: Props) {
	return (
		<Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
			<DialogContent className="flex max-h-[90vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-2xl border-foreground/10 bg-editor-dialog p-8 shadow-2xl">
				<div className="mb-6 flex flex-shrink-0 items-center justify-between">
					<div>
						<DialogTitle className="text-xl font-bold text-foreground">
							{t("settings.crop.title")}
						</DialogTitle>
						<p className="mt-2 text-sm text-muted-foreground">
							{t("settings.crop.instruction")}
						</p>
					</div>
				</div>
				{/* The drag handles must never be clipped by an ancestor's overflow —
					a mousedown that misses a clipped-out handle falls through to the
					dialog's backdrop and closes the whole editor instead of cropping.
					Sizing this as the flex-remainder (not a fixed vh value that
					ignores the header/footer above and below it) keeps the whole
					crop area, including its edge handles, on-screen and reachable. */}
				<div className="flex min-h-0 flex-1 overflow-hidden">
					<CropControl
						videoElement={videoElement}
						cropRegion={cropRegion}
						onCropChange={setCropRegion}
						aspectRatio={aspectRatio}
					/>
				</div>
				<div className="mt-6 flex flex-shrink-0 justify-end">
					<Button
						onClick={onDone}
						size="lg"
						className="bg-[#2563EB] text-white hover:bg-[#2563EB]/90"
					>
						{t("common.actions.done")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
