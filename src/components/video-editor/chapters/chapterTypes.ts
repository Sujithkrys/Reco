export interface ChapterMarker {
	id: string;
	timeMs: number;
	title: string;
}

export interface GenerateChaptersOptions {
	videoPath?: string | null;
	transcript?: Array<{ startMs: number; endMs: number; text: string }>;
}
