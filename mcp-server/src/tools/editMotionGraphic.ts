import type { MotionGraphicSpec } from "../motionGraphicSpec.js";
import { renderSpecToVideo } from "../renderClient.js";
import { uploadClipVideo } from "../storage.js";
import { supabase } from "../supabaseClient.js";
import type { MotionGraphicResult } from "./createMotionGraphic.js";

export async function editMotionGraphic(
	projectId: string,
	clipId: string,
	spec: MotionGraphicSpec,
): Promise<MotionGraphicResult> {
	const { data: clip, error: fetchError } = await supabase
		.from("motion_graphic_clips")
		.select("id, project_id")
		.eq("id", clipId)
		.maybeSingle();

	if (fetchError) {
		throw new Error(`Failed to look up clip: ${fetchError.message}`);
	}
	if (!clip) {
		throw new Error(`No clip found with id ${clipId}`);
	}
	if (clip.project_id !== projectId) {
		throw new Error(`Clip ${clipId} does not belong to project ${projectId}`);
	}

	await supabase
		.from("motion_graphic_clips")
		.update({ spec, status: "rendering", error: null, updated_at: new Date().toISOString() })
		.eq("id", clipId);

	try {
		const video = await renderSpecToVideo(spec);
		const videoUrl = await uploadClipVideo(clipId, video);

		await supabase
			.from("motion_graphic_clips")
			.update({ video_url: videoUrl, status: "done", updated_at: new Date().toISOString() })
			.eq("id", clipId);

		return { clipId, videoUrl, spec };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await supabase
			.from("motion_graphic_clips")
			.update({ status: "error", error: message, updated_at: new Date().toISOString() })
			.eq("id", clipId);
		throw error;
	}
}
