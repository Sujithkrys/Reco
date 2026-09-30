import { supabase } from "@/lib/supabase";
import type { ChapterMarker, GenerateChaptersOptions } from "./chapterTypes";
import { sanitizeChapterMarkers } from "./chapterUtils";

/**
 * Calls the Supabase Edge Function to generate chapter markers from transcript or video audio.
 * Enforces authenticated user session before dispatching request.
 */
export async function generateAutoChapters(
	options: GenerateChaptersOptions,
): Promise<{ success: boolean; chapters?: ChapterMarker[]; error?: string }> {
	try {
		// 1. Enforce Authentication Gate
		const { data: sessionData } = await supabase.auth.getSession();
		const token = sessionData?.session?.access_token;
		if (!token) {
			throw new Error("Please sign in to generate auto-chapters.");
		}

		const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
		const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

		// ── Fast Path: If transcript already exists from captions ──
		if (options.transcript && options.transcript.length > 0) {
			console.log("[chaptersService] Generating chapters directly from existing transcript...");
			const response = await fetch(`${supabaseUrl}/functions/v1/transcribe-and-translate`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					apikey: publishableKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					action: "generate-chapters",
					transcript: options.transcript,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Edge function failed (${response.status}): ${errorText}`);
			}

			const data = await response.json();
			if (!data?.success) {
				throw new Error(data?.error || "Failed to generate chapters");
			}

			return {
				success: true,
				chapters: sanitizeChapterMarkers(data.chapters),
			};
		}

		// ── Audio Extraction Path: If no transcript exists yet ──
		if (!options.videoPath) {
			throw new Error("No video or transcript provided for chapter generation");
		}

		console.log("[chaptersService] Extracting audio for auto-chapters...");
		const { VideoMuxer } = await import("@/lib/exporter/muxer");
		const { AudioProcessor } = await import("@/lib/exporter/audioEncoder");
		const { WebDemuxer } = await import("web-demuxer");

		const config = { frameRate: 30, width: 0, height: 0, bitRate: 0, bitrate: 0, sampleRate: 16000 } as any;
		const muxer = new VideoMuxer(config, true, "buffer", false);
		await muxer.initialize();

		const demuxer = new (WebDemuxer as any)(options.videoPath);
		await (demuxer as any).load();

		const audioProcessor = new AudioProcessor();
		await audioProcessor.process(
			demuxer,
			muxer,
			options.videoPath,
			[],
			[],
			undefined,
			[],
			[],
			{},
			undefined,
			[],
		);

		const muxResult = await muxer.finalize();
		if (muxResult.mode !== "buffer" || !muxResult.blob) {
			throw new Error("Failed to extract audio for chapter generation");
		}

		const formData = new FormData();
		formData.append("file", muxResult.blob, "audio-extract.m4a");
		formData.append("generateChapters", "true");

		const response = await fetch(`${supabaseUrl}/functions/v1/transcribe-and-translate`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				apikey: publishableKey,
			},
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Edge function failed (${response.status}): ${errorText}`);
		}

		const data = await response.json();
		if (!data?.success) {
			throw new Error(data?.error || "Failed to generate chapters");
		}

		return {
			success: true,
			chapters: sanitizeChapterMarkers(data.chapters || []),
		};
	} catch (error: any) {
		console.error("[chaptersService] Error:", error);
		return {
			success: false,
			error: error.message || String(error),
		};
	}
}
