import { BookmarkSimple } from "@phosphor-icons/react";
import { useTimelineContext } from "dnd-timeline";
import React from "react";
import type { ChapterMarker } from "../../../chapters/chapterTypes";
import { formatChapterTimestamp } from "../../../chapters/chapterUtils";

interface ChapterMarkersProps {
	chapters: ChapterMarker[];
	selectedChapterId: string | null;
	onSelectChapter: (id: string | null) => void;
	onSeek: (seconds: number) => void;
	timelineRef: React.RefObject<HTMLDivElement>;
}

export const ChapterMarkers: React.FC<ChapterMarkersProps> = ({
	chapters,
	selectedChapterId,
	onSelectChapter,
	onSeek,
}) => {
	const { sidebarWidth, range, valueToPixels } = useTimelineContext();

	if (!chapters || chapters.length === 0) {
		return null;
	}

	return (
		<>
			{chapters.map((chapter) => {
				const offset = valueToPixels(chapter.timeMs - range.start);
				const isSelected = chapter.id === selectedChapterId;

				// Don't render markers completely outside the visible viewport
				if (offset < -20 || offset > 5000) return null;

				return (
					<div
						key={chapter.id}
						className={`group absolute top-1 cursor-pointer select-none transition-transform hover:scale-110 ${
							isSelected ? "z-50" : "z-30"
						}`}
						style={{
							left: `${sidebarWidth + offset - 7}px`,
						}}
						onClick={(e) => {
							e.stopPropagation();
							onSelectChapter(chapter.id);
							onSeek(chapter.timeMs / 1000);
						}}
						title={`${formatChapterTimestamp(chapter.timeMs)} - ${chapter.title}`}
					>
						{/* Pin marker icon */}
						<div
							className={`flex items-center justify-center h-4 w-4 rounded-md shadow-sm transition-colors ${
								isSelected
									? "bg-amber-400 text-black ring-2 ring-amber-400/50"
									: "bg-blue-600/90 text-white hover:bg-amber-400 hover:text-black"
							}`}
						>
							<BookmarkSimple className="h-2.5 w-2.5" weight="fill" />
						</div>

						{/* Hover pill preview */}
						<div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex items-center gap-1.5 whitespace-nowrap rounded-md bg-neutral-900/95 px-2 py-1 text-[11px] font-medium text-white shadow-xl backdrop-blur-sm border border-white/10 z-50">
							<span className="font-mono text-amber-400">
								{formatChapterTimestamp(chapter.timeMs)}
							</span>
							<span className="text-neutral-300">•</span>
							<span>{chapter.title}</span>
						</div>
					</div>
				);
			})}
		</>
	);
};

export default ChapterMarkers;
