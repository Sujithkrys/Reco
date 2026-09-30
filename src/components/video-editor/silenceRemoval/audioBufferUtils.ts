export async function getDecodedAudioBuffer(mediaUrl: string): Promise<AudioBuffer> {
	const response = await fetch(mediaUrl);
	if (!response.ok) {
		throw new Error(`Failed to fetch media audio: ${response.status}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const AudioContextClass =
		window.AudioContext ||
		(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

	if (!AudioContextClass) {
		throw new Error("Web Audio API AudioContext not supported on this browser.");
	}

	const audioContext = new AudioContextClass();
	try {
		return await audioContext.decodeAudioData(arrayBuffer);
	} finally {
		try {
			await audioContext.close();
		} catch {
			// ignore
		}
	}
}

/**
 * Extracts mono channel data from an AudioBuffer.
 * If stereo or multi-channel, downmixes to mono Float32Array.
 */
export function getMonoChannelData(audioBuffer: AudioBuffer): Float32Array {
	const numChannels = audioBuffer.numberOfChannels;
	const length = audioBuffer.length;

	if (numChannels === 1) {
		return audioBuffer.getChannelData(0);
	}

	const mono = new Float32Array(length);
	for (let c = 0; c < numChannels; c++) {
		const channel = audioBuffer.getChannelData(c);
		for (let i = 0; i < length; i++) {
			mono[i] += channel[i] / numChannels;
		}
	}

	return mono;
}
