/** Seek step of a plain Left / Right arrow, in seconds. */
export const SEEK_STEP_SECONDS = 1;
/** Seek step with Shift held, in seconds. */
export const SEEK_STEP_SECONDS_FAST = 5;
/** Frame rate used for Alt + arrow when the video's own is not known. */
export const FALLBACK_FRAME_RATE = 30;

export type PlaybackKeyAction =
	| { type: "seekSeconds"; seconds: number }
	| { type: "seekFrames"; frames: number };

export interface PlaybackKeyInput {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	/** Focus is in a text field, the text editor, a slider, a menu or a dialog. */
	editable: boolean;
	/** A layer is selected: arrows move it instead. */
	hasLayerSelected: boolean;
}

/** Left / Right seek 1 s, Shift 5 s, Alt one frame; only with no layer selected and focus outside text fields. */
export function mapPlaybackKey(input: PlaybackKeyInput): PlaybackKeyAction | null {
	if (input.editable || input.hasLayerSelected) return null;
	if (input.ctrlKey || input.metaKey) return null;
	const direction = input.key === "ArrowLeft" ? -1 : input.key === "ArrowRight" ? 1 : 0;
	if (direction === 0) return null;
	if (input.altKey) return { type: "seekFrames", frames: direction };
	return {
		type: "seekSeconds",
		seconds: direction * (input.shiftKey ? SEEK_STEP_SECONDS_FAST : SEEK_STEP_SECONDS),
	};
}

export function resolveFrameRate(frameRate: number | null | undefined): number {
	return typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0
		? frameRate
		: FALLBACK_FRAME_RATE;
}

/** Where the playhead goes, clamped to the video: 0 to its duration. */
export function seekTargetSeconds(
	current: number,
	action: PlaybackKeyAction,
	duration: number,
	frameRate?: number | null,
): number {
	const delta =
		action.type === "seekSeconds" ? action.seconds : action.frames / resolveFrameRate(frameRate);
	const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
	const base = Number.isFinite(current) ? current : 0;
	return Math.min(safeDuration, Math.max(0, base + delta));
}
