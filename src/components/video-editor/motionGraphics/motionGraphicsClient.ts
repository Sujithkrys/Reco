import { supabase } from "@/lib/supabase";
import type { GeneratedClipSpec } from "../types";

export interface MotionGraphicClipRow {
	id: string;
	spec: GeneratedClipSpec;
	videoUrl: string;
	status: string;
	createdAt: string;
}

// Reco's real projects live in browser storage and never touch Supabase on
// their own -- this is the one place that bridges a local project into the
// `projects` table so create_motion_graphic (which checks that table) has
// something to find. Safe to call every time the panel opens: `ignoreDuplicates`
// makes it a no-op once the row exists, so it never clobbers a name/state a
// later feature might set.
export async function ensureProjectRegistered(projectId: string, name: string): Promise<void> {
	const { error } = await supabase
		.from("projects")
		.upsert({ id: projectId, name, editor_state: {} }, { onConflict: "id", ignoreDuplicates: true });
	if (error) {
		throw new Error(`Failed to register project: ${error.message}`);
	}
}

export async function listMotionGraphicClips(projectId: string): Promise<MotionGraphicClipRow[]> {
	const { data, error } = await supabase
		.from("motion_graphic_clips")
		.select("id, spec, video_url, status, created_at")
		.eq("project_id", projectId)
		.eq("status", "done")
		.order("created_at", { ascending: false });

	if (error) {
		throw new Error(`Failed to list motion graphic clips: ${error.message}`);
	}

	return (data ?? []).map((row) => ({
		id: row.id as string,
		spec: row.spec as GeneratedClipSpec,
		videoUrl: row.video_url as string,
		status: row.status as string,
		createdAt: row.created_at as string,
	}));
}

const DEFAULT_FPS = 30;

export function getGeneratedClipSpecDurationMs(spec: GeneratedClipSpec): number {
	const fps = spec.fps && spec.fps > 0 ? spec.fps : DEFAULT_FPS;
	return Math.round((spec.durationInFrames / fps) * 1000);
}

// The spec no longer carries any per-clip title (it's Claude-authored code,
// not structured template props with a "text" field to read back) -- clips
// are told apart by their render date in the Motion Graphics menu instead.
export function getGeneratedClipSpecLabel(_spec: GeneratedClipSpec): string {
	return "Motion graphic";
}
