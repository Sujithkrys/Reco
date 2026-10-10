import type { Dispatch, SetStateAction } from "react";

/** Every kind of item that can be selected on the timeline. Only one is selected at a time. */
export type TimelineSelectionKind =
	| "zoom"
	| "clip"
	| "annotation"
	| "audio"
	| "caption"
	| "generatedClip";

type IdSetter = Dispatch<SetStateAction<string | null>>;

export interface TimelineSelectionSetters {
	setSelectedZoomId: IdSetter;
	setSelectedClipId: IdSetter;
	setSelectedAnnotationId: IdSetter;
	setSelectedAudioId: IdSetter;
	setSelectedCaptionId: IdSetter;
	setSelectedGeneratedClipId: IdSetter;
}

const SETTER_BY_KIND: Record<TimelineSelectionKind, keyof TimelineSelectionSetters> = {
	zoom: "setSelectedZoomId",
	clip: "setSelectedClipId",
	annotation: "setSelectedAnnotationId",
	audio: "setSelectedAudioId",
	caption: "setSelectedCaptionId",
	generatedClip: "setSelectedGeneratedClipId",
};

/** Clear every timeline selection except `keep`, so selecting one item deselects the rest. */
export function clearTimelineSelectionsExcept(
	setters: TimelineSelectionSetters,
	keep: TimelineSelectionKind,
): void {
	for (const kind of Object.keys(SETTER_BY_KIND) as TimelineSelectionKind[]) {
		if (kind !== keep) setters[SETTER_BY_KIND[kind]](null);
	}
}
