import { env } from "./env.js";
import { supabase } from "./supabaseClient.js";

/** Uploads a rendered clip's video bytes and returns its public URL. */
export async function uploadClipVideo(clipId: string, video: Buffer): Promise<string> {
	const path = `${clipId}.mp4`;
	const { error } = await supabase.storage
		.from(env.motionGraphicsBucket)
		.upload(path, video, { contentType: "video/mp4", upsert: true });

	if (error) {
		throw new Error(`Failed to upload rendered video: ${error.message}`);
	}

	const { data } = supabase.storage.from(env.motionGraphicsBucket).getPublicUrl(path);
	return data.publicUrl;
}
