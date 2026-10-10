import { describe, expect, it } from "vitest";
import { sanitizeRect } from "./annotationCanvasBounds";

describe("sanitizeRect", () => {
	it("does not limit a layer to the canvas", () => {
		const rect = { x: -80, y: 250, width: 30, height: 20 };
		expect(sanitizeRect(rect)).toEqual(rect);
	});

	it("replaces non-finite values", () => {
		expect(sanitizeRect({ x: Number.NaN, y: Infinity, width: Number.NaN, height: -Infinity })).toEqual({
			x: 0,
			y: 0,
			width: 0,
			height: 0,
		});
	});
});
