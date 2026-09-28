import { fetchRenderResult, waitForRender } from "../renderClient.js";
import { uploadClipVideo } from "../storage.js";
import { supabase } from "../supabaseClient.js";

// Runs after create_motion_graphic/edit_motion_graphic have already returned
// to the caller. A render can legitimately take several minutes (see
// renderClient's poll timeout) -- holding the MCP tool call's HTTP response
// open for that whole time is what caused a status check to 502 mid-render
// with no way to tell whether a clip had actually been created. The tool
// call itself only submits the render (fast) and returns immediately; this
// function does the actual waiting, uploads the result, and updates the
// clip's row so get_motion_graphic_status can be polled safely (including
// after a 502/dropped connection, since it's just a DB read, not a
// long-held call tied to the render's own lifetime).
export async function completeRenderInBackground(clipId: string, jobId: string): Promise<void> {
	try {
		await waitForRender(jobId);
		const video = await fetchRenderResult(jobId);
		const videoUrl = await uploadClipVideo(clipId, video);

		await supabase
			.from("motion_graphic_clips")
			.update({ video_url: videoUrl, status: "done", updated_at: new Date().toISOString() })
			.eq("id", clipId);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await supabase
			.from("motion_graphic_clips")
			.update({ status: "error", error: message, updated_at: new Date().toISOString() })
			.eq("id", clipId);
	}
}
