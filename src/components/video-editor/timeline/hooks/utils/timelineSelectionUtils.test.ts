import { describe, expect, it } from "vitest";
import { resolveDeleteSelectionTarget } from "./timelineSelectionUtils";

describe("timelineSelectionUtils", () => {
	it("treats zoom select-all as a zoom deletion target", () => {
		expect(
			resolveDeleteSelectionTarget({
				selectAllBlocksActive: true,
				selectedKeyframeId: "kf-1",
				selectedZoomId: "z-1",
				selectedClipId: "c-1",
				selectedAnnotationId: "a-1",
				selectedAudioId: "au-1",
			}),
		).toBe("zoom");
	});

	it("follows selection priority order", () => {
		expect(
			resolveDeleteSelectionTarget({
				selectAllBlocksActive: false,
				selectedKeyframeId: "kf-1",
				selectedZoomId: "z-1",
			}),
		).toBe("keyframe");
		expect(
			resolveDeleteSelectionTarget({
				selectAllBlocksActive: false,
				selectedKeyframeId: null,
				selectedZoomId: "z-1",
				selectedClipId: "c-1",
			}),
		).toBe("zoom");
		expect(
			resolveDeleteSelectionTarget({
				selectAllBlocksActive: false,
				selectedKeyframeId: null,
				selectedZoomId: null,
				selectedClipId: "c-1",
				selectedAnnotationId: "a-1",
			}),
		).toBe("annotation");
	});

	it.each([
		["annotation", { selectedAnnotationId: "a-1" }],
		["audio", { selectedAudioId: "au-1" }],
		["caption", { selectedCaptionId: "cap-1" }],
	] as const)("prefers a selected %s over a clip left selected underneath it", (target, layer) => {
		expect(
			resolveDeleteSelectionTarget({
				selectAllBlocksActive: false,
				selectedKeyframeId: null,
				selectedZoomId: null,
				selectedClipId: "c-1",
				...layer,
			}),
		).toBe(target);
	});

	it("targets the clip when it is the only selection", () => {
		expect(
			resolveDeleteSelectionTarget({
				selectAllBlocksActive: false,
				selectedKeyframeId: null,
				selectedZoomId: null,
				selectedClipId: "c-1",
			}),
		).toBe("clip");
	});

	it("returns none when nothing is selected", () => {
		expect(
			resolveDeleteSelectionTarget({
				selectAllBlocksActive: false,
				selectedKeyframeId: null,
				selectedZoomId: null,
			}),
		).toBe("none");
	});
});
