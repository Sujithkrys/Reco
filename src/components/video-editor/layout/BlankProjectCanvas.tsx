import { FileVideo, VideoCamera } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type BlankProjectCanvasProps = {
	onImportVideo: () => void;
	onImportFile: (file: File) => void;
	onRecordScreen: () => void;
};

export function BlankProjectCanvas({
	onImportVideo,
	onImportFile,
	onRecordScreen,
}: BlankProjectCanvasProps) {
	const [isDragActive, setIsDragActive] = useState(false);
	const dragDepthRef = useRef(0);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleDragEnter = (event: React.DragEvent) => {
		event.preventDefault();
		dragDepthRef.current += 1;
		if (event.dataTransfer.types.includes("Files")) setIsDragActive(true);
	};
	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
	};
	const handleDragLeave = (event: React.DragEvent) => {
		event.preventDefault();
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
		if (dragDepthRef.current === 0) setIsDragActive(false);
	};
	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();
		dragDepthRef.current = 0;
		setIsDragActive(false);
		const file = event.dataTransfer.files?.[0];
		if (file) onImportFile(file);
	};

	return (
		<div
			className="flex h-full w-full flex-col items-center justify-center p-8 bg-editor-panel rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-foreground/10"
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<div
				className={`flex flex-col items-center justify-center max-w-md text-center p-10 border-2 border-dashed rounded-2xl bg-editor-bg transition-colors ${
					isDragActive ? "border-blue-500 bg-blue-500/5" : "border-foreground/20"
				}`}
			>
				<div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5 text-foreground/40 mb-6">
					<FileVideo weight="duotone" className="h-8 w-8" />
				</div>

				<h2 className="text-xl font-bold text-foreground mb-2 tracking-tight">
					{isDragActive ? "Drop your video to import it" : "Your canvas is empty"}
				</h2>
				<p className="text-sm text-foreground/60 mb-8 max-w-[280px]">
					Drag and drop a video file here, or import one, or record your screen to get
					started editing.
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
						onClick={onRecordScreen}
						className="flex items-center justify-center gap-2 h-10 px-6 rounded-lg font-medium border-foreground/10 hover:bg-transparent"
					>
						<VideoCamera weight="bold" className="h-4 w-4" />
						Record Screen
					</Button>

					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className="text-xs font-medium text-blue-500 hover:text-blue-400 hover:underline mt-1"
					>
						or browse files
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept="video/*"
						className="hidden"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) onImportFile(file);
							event.target.value = "";
						}}
					/>
				</div>
			</div>
		</div>
	);
}
