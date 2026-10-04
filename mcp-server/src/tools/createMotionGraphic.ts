import type { MotionGraphicSpec } from "../motionGraphicSpec.js";
import { submitRender } from "../renderClient.js";
import { supabase } from "../supabaseClient.js";
import { completeRenderInBackground } from "./completeRenderInBackground.js";

export interface MotionGraphicSubmitResult {
	clipId: string;
	status: "rendering";
}

export async function createMotionGraphic(
	projectId: string,
	spec: MotionGraphicSpec,
): Promise<MotionGraphicSubmitResult> {
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

	// Submitting just gets a job id back -- fast. The actual render can take
	// several minutes, so it runs in the background rather than holding this
	// tool call's connection open; poll get_motion_graphic_status with the
	// returned clip id instead.
	const jobId = await submitRender(spec);
	void completeRenderInBackground(clip.id, jobId);

	return { clipId: clip.id, status: "rendering" };
}
