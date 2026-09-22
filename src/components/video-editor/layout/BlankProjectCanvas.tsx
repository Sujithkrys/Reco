import { FileVideo, VideoCamera } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type BlankProjectCanvasProps = {
	onImportVideo: () => void;
};

export function BlankProjectCanvas({ onImportVideo }: BlankProjectCanvasProps) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center p-8 bg-editor-panel rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-foreground/10">
			<div className="flex flex-col items-center justify-center max-w-md text-center p-10 border-2 border-dashed border-foreground/20 rounded-2xl bg-editor-bg">
				<div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5 text-foreground/40 mb-6">
					<FileVideo weight="duotone" className="h-8 w-8" />
				</div>
				
				<h2 className="text-xl font-bold text-foreground mb-2 tracking-tight">
					Your canvas is empty
				</h2>
				<p className="text-sm text-foreground/60 mb-8 max-w-[280px]">
					Import a video file or record your screen to get started editing.
				</p>
				
				<div className="flex flex-col gap-3 w-full sm:w-auto">
					<Button
						onClick={onImportVideo}
						className="flex items-center justify-center gap-2 h-10 px-6 rounded-lg bg-blue-600 text-white font-medium transition hover:bg-blue-700"
					>
						<FileVideo weight="bold" className="h-4 w-4" />
						Import Video
					</Button>
					
					<Button
						variant="outline"
						disabled
						title="Coming soon"
						className="flex items-center justify-center gap-2 h-10 px-6 rounded-lg font-medium opacity-50 cursor-not-allowed border-foreground/10 hover:bg-transparent"
					>
						<VideoCamera weight="bold" className="h-4 w-4" />
						Record Screen
					</Button>
				</div>
			</div>
		</div>
	);
}
