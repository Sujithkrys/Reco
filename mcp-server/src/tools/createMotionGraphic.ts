import type { MotionGraphicSpec } from "../motionGraphicSpec.js";
import { renderSpecToVideo } from "../renderClient.js";
import { uploadClipVideo } from "../storage.js";
import { supabase } from "../supabaseClient.js";

export interface MotionGraphicResult {
	clipId: string;
	videoUrl: string;
	spec: MotionGraphicSpec;
}

export async function createMotionGraphic(
	projectId: string,
	spec: MotionGraphicSpec,
): Promise<MotionGraphicResult> {
	const { data: project, error: projectError } = await supabase
		.from("projects")
		.select("id")
		.eq("id", projectId)
		.maybeSingle();

	if (projectError) {
		throw new Error(`Failed to look up project: ${projectError.message}`);
	}
	if (!project) {
		throw new Error(`No project found with id ${projectId}`);
	}

	const { data: clip, error: insertError } = await supabase
		.from("motion_graphic_clips")
		.insert({ project_id: projectId, spec, status: "rendering" })
		.select("id")
		.single();

	if (insertError || !clip) {
		throw new Error(`Failed to create clip row: ${insertError?.message ?? "unknown error"}`);
	}

	try {
		const video = await renderSpecToVideo(spec);
		const videoUrl = await uploadClipVideo(clip.id, video);

		await supabase
			.from("motion_graphic_clips")
			.update({ video_url: videoUrl, status: "done", updated_at: new Date().toISOString() })
			.eq("id", clip.id);

		return { clipId: clip.id, videoUrl, spec };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await supabase
			.from("motion_graphic_clips")
			.update({ status: "error", error: message, updated_at: new Date().toISOString() })
			.eq("id", clip.id);
		throw error;
	}
}
