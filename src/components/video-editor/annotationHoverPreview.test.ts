import { afterEach, describe, expect, it } from "vitest";
import {
	applyAnnotationPreview,
	clearAnnotationPreview,
	getAnnotationPreview,
	previewAnnotation,
} from "./annotationHoverPreview";
import { createProjectData, normalizeProjectEditor } from "./projectPersistence";
import { clearTextSelection, setTextSelection } from "./textSelectionStore";
import {
	type AnnotationRegion,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_FIGURE_DATA,
	DEFAULT_SHAPE_DATA,
} from "./types";

function region(id: string, over: Partial<AnnotationRegion> = {}): AnnotationRegion {
	return {
		id,
		startMs: 0,
		endMs: 1000,
		type: "text",
		content: "Hi",
		textContent: "Hi",
		position: { ...DEFAULT_ANNOTATION_POSITION },
		size: { ...DEFAULT_ANNOTATION_SIZE },
		style: { ...DEFAULT_ANNOTATION_STYLE, color: "#ffffff" },
		zIndex: 1,
		trackIndex: 0,
		...over,
	};
}

afterEach(() => {
	clearAnnotationPreview();
});

describe("annotation hover preview", () => {
	it("applies the hovered value to the previewed layer only", () => {
		const regions = [region("a"), region("b")];
		previewAnnotation("a", { style: { color: "#ff0000" } });
		const shown = applyAnnotationPreview(regions, getAnnotationPreview());
		expect(shown[0].style.color).toBe("#ff0000");
		expect(shown[0].style.fontSize).toBe(regions[0].style.fontSize);
		expect(shown[1]).toBe(regions[1]);
	});

	it("applies shape, arrow and blur colours and fonts", () => {
		const regions = [
			region("s", { type: "shape", shapeData: { ...DEFAULT_SHAPE_DATA } }),
			region("f", { type: "figure", figureData: { ...DEFAULT_FIGURE_DATA } }),
			region("b", { type: "blur", blurColor: "#000000" }),
			region("t"),
		];
		previewAnnotation("s", { shapeData: { fillColor: "#123456" } });
		expect(applyAnnotationPreview(regions, getAnnotationPreview())[0].shapeData?.fillColor).toBe(
			"#123456",
		);
		previewAnnotation("f", { figureData: { color: "#654321" } });
		expect(applyAnnotationPreview(regions, getAnnotationPreview())[1].figureData?.color).toBe(
			"#654321",
		);
		previewAnnotation("b", { blurColor: "#abcdef" });
		expect(applyAnnotationPreview(regions, getAnnotationPreview())[2].blurColor).toBe("#abcdef");
		previewAnnotation("t", { style: { fontFamily: "Georgia, serif" } });
		expect(applyAnnotationPreview(regions, getAnnotationPreview())[3].style.fontFamily).toBe(
			"Georgia, serif",
		);
	});

	it("reverts when the preview is cleared", () => {
		const regions = [region("a")];
		previewAnnotation("a", { style: { color: "#ff0000" } });
		clearAnnotationPreview();
		expect(getAnnotationPreview()).toBeNull();
		expect(applyAnnotationPreview(regions, getAnnotationPreview())).toBe(regions);
	});

	it("ignores a preview for a layer that no longer exists", () => {
		const regions = [region("a")];
		previewAnnotation("gone", { style: { color: "#ff0000" } });
		expect(applyAnnotationPreview(regions, getAnnotationPreview())).toBe(regions);
	});

	it("never changes the real regions, so it cannot reach the saved project", () => {
		const regions = [region("a")];
		const before = structuredClone(regions);
		previewAnnotation("a", { style: { color: "#ff0000" } });
		applyAnnotationPreview(regions, getAnnotationPreview());
		expect(regions).toEqual(before);

		const saved = createProjectData("/v.webm", normalizeProjectEditor({ annotationRegions: regions }));
		expect(JSON.stringify(saved)).not.toContain("#ff0000");
		expect(saved.editor.annotationRegions?.[0].style.color).toBe("#ffffff");
	});

	it("previews a text style on the selected range only when text is selected", () => {
		const regions = [region("a", { content: "Hello world", textContent: "Hello world" })];
		setTextSelection({ annotationId: "a", start: 6, end: 11 });
		previewAnnotation("a", { style: { color: "#ff0000", backgroundColor: "#000000" } });
		const shown = applyAnnotationPreview(regions, getAnnotationPreview())[0];
		clearTextSelection();

		expect(shown.style.color).toBe("#ffffff");
		// The box background is a layer property: it still applies to the whole layer.
		expect(shown.style.backgroundColor).toBe("#000000");
		expect(shown.textRuns).toEqual([{ text: "Hello " }, { text: "world", style: { color: "#ff0000" } }]);
	});

	it("previews a held Ctrl +/- by scaling every text size", () => {
		const regions = [
			region("a", {
				content: "ab",
				textContent: "ab",
				style: { ...DEFAULT_ANNOTATION_STYLE, fontSize: 32 },
				textRuns: [{ text: "a" }, { text: "b", style: { fontSize: 48 } }],
			}),
		];
		previewAnnotation("a", { textScale: 1.25 });
		const shown = applyAnnotationPreview(regions, getAnnotationPreview())[0];
		expect(shown.style.fontSize).toBe(40);
		expect(shown.textRuns).toEqual([{ text: "a" }, { text: "b", style: { fontSize: 60 } }]);
	});

	it("previews a text style on the whole layer without a selection, like the commit", () => {
		const regions = [
			region("a", {
				content: "Hello world",
				textContent: "Hello world",
				textRuns: [{ text: "Hello " }, { text: "world", style: { color: "#00ff00" } }],
			}),
		];
		previewAnnotation("a", { style: { color: "#ff0000" } });
		const shown = applyAnnotationPreview(regions, getAnnotationPreview())[0];

		expect(shown.style.color).toBe("#ff0000");
		expect(shown.textRuns).toBeUndefined();
	});
});
