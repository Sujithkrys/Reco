import type { MotionGraphicSpec } from "../motionGraphicSpec.js";
import { submitRender } from "../renderClient.js";
import { supabase } from "../supabaseClient.js";
import { completeRenderInBackground } from "./completeRenderInBackground.js";
import type { MotionGraphicSubmitResult } from "./createMotionGraphic.js";

export async function editMotionGraphic(
	projectId: string,
	clipId: string,
	spec: MotionGraphicSpec,
): Promise<MotionGraphicSubmitResult> {
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

	// Same async pattern as createMotionGraphic: submit (fast), return
	// immediately, finish in the background -- poll get_motion_graphic_status.
	const jobId = await submitRender(spec);
	void completeRenderInBackground(clipId, jobId);

	return { clipId, status: "rendering" };
}
