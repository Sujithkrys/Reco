import { ALL_FORMATS, BlobSource, Input, UrlSource } from "mediabunny";

/** A duration a header can be trusted with: FFmpeg reports "no value" as a huge negative number. */
export function isKnownMediaDuration(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Measures a media file's duration from its packets, for files whose header has none (a
 * MediaRecorder WebM that was imported as is). Null when it cannot be measured.
 */
export async function measureMediaDurationSec(source: string | Blob): Promise<number | null> {
	let input: Input | null = null;
	try {
		input = new Input({
			source: typeof source === "string" ? new UrlSource(source) : new BlobSource(source),
			formats: ALL_FORMATS,
		});
		const duration = await input.computeDuration();
		return isKnownMediaDuration(duration) ? duration : null;
	} catch {
		return null;
	} finally {
		input?.dispose();
	}
}

export const UNKNOWN_SOURCE_DURATION_ERROR =
	"The source video has no duration in its header and it could not be measured, so no frames can be exported. Re-save the video (for example convert it to MP4) and import it again.";
