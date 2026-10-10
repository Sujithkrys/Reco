import { describe, expect, it, vi } from "vitest";
import {
	clearTimelineSelectionsExcept,
	type TimelineSelectionKind,
	type TimelineSelectionSetters,
} from "./timelineSelection";

function createSetters() {
	return {
		setSelectedZoomId: vi.fn(),
		setSelectedClipId: vi.fn(),
		setSelectedAnnotationId: vi.fn(),
		setSelectedAudioId: vi.fn(),
		setSelectedCaptionId: vi.fn(),
		setSelectedGeneratedClipId: vi.fn(),
	} satisfies TimelineSelectionSetters;
}

const kindToSetter: Record<TimelineSelectionKind, keyof TimelineSelectionSetters> = {
	zoom: "setSelectedZoomId",
	clip: "setSelectedClipId",
	annotation: "setSelectedAnnotationId",
	audio: "setSelectedAudioId",
	caption: "setSelectedCaptionId",
	generatedClip: "setSelectedGeneratedClipId",
};

describe("exclusive timeline selection", () => {
	it.each(Object.keys(kindToSetter) as TimelineSelectionKind[])(
		"selecting a %s clears every other selection, including the main clip",
		(kind) => {
			const setters = createSetters();

			clearTimelineSelectionsExcept(setters, kind);

			for (const [otherKind, setterName] of Object.entries(kindToSetter)) {
				if (otherKind === kind) {
					expect(setters[setterName]).not.toHaveBeenCalled();
				} else {
					expect(setters[setterName]).toHaveBeenCalledWith(null);
				}
			}
		},
	);
});
