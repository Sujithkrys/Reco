/**
 * File lengths learned at runtime (from probing on import or from waveform
 * peaks), keyed by audio path. Lets trims on projects saved before
 * `sourceDurationMs` existed respect the end of the file without writing
 * editor state in the background, which would add an empty undo step.
 */
const knownAudioFileDurationsMs = new Map<string, number>();

export function rememberAudioFileDurationMs(audioPath: string, durationMs: number): void {
	if (!audioPath || !Number.isFinite(durationMs) || durationMs <= 0) return;
	knownAudioFileDurationsMs.set(audioPath, Math.round(durationMs));
}

export function getKnownAudioFileDurationMs(audioPath: string): number | undefined {
	return knownAudioFileDurationsMs.get(audioPath);
}
