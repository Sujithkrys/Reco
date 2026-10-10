import { describe, expect, it } from "vitest";
import { collectProjectColors } from "./projectColors";
import {
	type AnnotationRegion,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_SHAPE_DATA,
} from "./types";

function region(id: string, over: Partial<AnnotationRegion>): AnnotationRegion {
	return {
		id,
		startMs: 0,
		endMs: 1000,
		type: "text",
		content: "",
		position: { ...DEFAULT_ANNOTATION_POSITION },
		size: { ...DEFAULT_ANNOTATION_SIZE },
		style: { ...DEFAULT_ANNOTATION_STYLE },
		zIndex: 1,
		...over,
	};
}

describe("collectProjectColors", () => {
	it("gathers layer colours once each, skipping transparent and empty values", () => {
		const regions = [
			region("a", { style: { ...DEFAULT_ANNOTATION_STYLE, color: "#FF0000", backgroundColor: "transparent" } }),
			region("b", {
				type: "shape",
				shapeData: { ...DEFAULT_SHAPE_DATA, fillColor: "#ff0000", strokeColor: "#00ff00" },
				style: { ...DEFAULT_ANNOTATION_STYLE, color: "#123" },
				blurColor: "",
			}),
		];
		const colors = collectProjectColors(regions);
		expect(colors).toContain("#ff0000");
		expect(colors).toContain("#00ff00");
		expect(colors).toContain("#112233");
		expect(colors.filter((color) => color === "#ff0000")).toHaveLength(1);
		expect(colors).not.toContain("transparent");
	});

	it("returns nothing for no layers", () => {
		expect(collectProjectColors([])).toEqual([]);
	});
});
