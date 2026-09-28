import { supabase } from "../supabaseClient.js";

export interface MotionGraphicStatusResult {
	clipId: string;
	status: string;
	videoUrl: string | null;
	error: string | null;
}

export async function getMotionGraphicStatus(clipId: string): Promise<MotionGraphicStatusResult> {
	const { data: clip, error } = await supabase
		.from("motion_graphic_clips")
		.select("id, status, video_url, error")
		.eq("id", clipId)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to look up clip: ${error.message}`);
	}
	if (!clip) {
		throw new Error(`No clip found with id ${clipId}`);
	}

	return {
		clipId: clip.id,
		status: clip.status,
		videoUrl: clip.video_url,
		error: clip.error,
	};
}
