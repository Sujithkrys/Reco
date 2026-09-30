export interface SilenceInterval {
	startMs: number;
	endMs: number;
	durationMs: number;
}

export interface DetectSilenceOptions {
	/** Decibel threshold below which audio is considered silence (default: -38 dB). */
	thresholdDb?: number;
	/** Minimum duration of silence in milliseconds to qualify as a cut candidate (default: 500 ms). */
	minDurationMs?: number;
	/** Padding in milliseconds preserved before and after speech to avoid clipping words (default: 100 ms). */
	speechPaddingMs?: number;
	/** Window size for RMS energy analysis in milliseconds (default: 20 ms). */
	windowSizeMs?: number;
}

export const DEFAULT_SILENCE_OPTIONS: Required<DetectSilenceOptions> = {
	thresholdDb: -38,
	minDurationMs: 500,
	speechPaddingMs: 100,
	windowSizeMs: 20,
};

/**
 * Detects silent intervals in an audio buffer based on RMS decibel thresholding.
 *
 * @param channelData Float32Array PCM audio samples (mono or downmixed)
 * @param sampleRate Audio sample rate in Hz (e.g. 44100 or 48000)
 * @param options Detection thresholds and timing options
 * @returns Array of silence intervals in milliseconds
 */
export function detectSilenceIntervals(
	channelData: Float32Array,
	sampleRate: number,
	options: DetectSilenceOptions = {},
): SilenceInterval[] {
	const thresholdDb = options.thresholdDb ?? DEFAULT_SILENCE_OPTIONS.thresholdDb;
	const minDurationMs = options.minDurationMs ?? DEFAULT_SILENCE_OPTIONS.minDurationMs;
	const speechPaddingMs = options.speechPaddingMs ?? DEFAULT_SILENCE_OPTIONS.speechPaddingMs;
	const windowSizeMs = options.windowSizeMs ?? DEFAULT_SILENCE_OPTIONS.windowSizeMs;

	if (channelData.length === 0 || sampleRate <= 0) {
		return [];
	}

	const windowSamples = Math.max(1, Math.floor((windowSizeMs / 1000) * sampleRate));
	const totalDurationMs = (channelData.length / sampleRate) * 1000;
	const numWindows = Math.floor(channelData.length / windowSamples);

	if (numWindows === 0) {
		return [];
	}

	// 1. Calculate RMS decibels for each window
	const isSilentWindow = new Uint8Array(numWindows);
	const minRms = 1e-5; // Prevent log10(0)

	for (let i = 0; i < numWindows; i++) {
		const startSample = i * windowSamples;
		let sumSquares = 0;
		for (let s = 0; s < windowSamples; s++) {
			const sample = channelData[startSample + s];
			sumSquares += sample * sample;
		}
		const rms = Math.sqrt(sumSquares / windowSamples);
		const db = 20 * Math.log10(Math.max(rms, minRms));
		if (db < thresholdDb) {
			isSilentWindow[i] = 1;
		}
	}

	// 2. Identify contiguous silent window sequences
	const rawSilenceSpans: { startMs: number; endMs: number }[] = [];
	let inSilence = false;
	let silenceStartWindow = 0;

	for (let i = 0; i < numWindows; i++) {
		if (isSilentWindow[i] === 1) {
			if (!inSilence) {
				inSilence = true;
				silenceStartWindow = i;
			}
		} else {
			if (inSilence) {
				inSilence = false;
				const startMs = (silenceStartWindow * windowSamples / sampleRate) * 1000;
				const endMs = (i * windowSamples / sampleRate) * 1000;
				rawSilenceSpans.push({ startMs, endMs });
			}
		}
	}

	if (inSilence) {
		const startMs = (silenceStartWindow * windowSamples / sampleRate) * 1000;
		const endMs = totalDurationMs;
		rawSilenceSpans.push({ startMs, endMs });
	}

	// 3. Apply speech padding and duration filtering
	const qualifiedIntervals: SilenceInterval[] = [];

	for (const span of rawSilenceSpans) {
		// If silence is at the very beginning of the media, no need for leading speech padding
		const paddedStart = span.startMs <= 50 ? 0 : span.startMs + speechPaddingMs;
		// If silence is at the very end of media, no need for trailing speech padding
		const paddedEnd = span.endMs >= totalDurationMs - 50 ? totalDurationMs : span.endMs - speechPaddingMs;

		const durationMs = paddedEnd - paddedStart;
		if (durationMs >= minDurationMs) {
			qualifiedIntervals.push({
				startMs: Math.round(paddedStart),
				endMs: Math.round(paddedEnd),
				durationMs: Math.round(durationMs),
			});
		}
	}

	return qualifiedIntervals;
}
