import { describe, expect, it } from "vitest";
import {
	computeLayerResize,
	handleFromRndDirection,
	type LayerResizeInput,
	type ResizeHandle,
	scaleTextFontSize,
} from "./annotationResize";

// A 200x100 box at (100, 50): right edge 300, bottom edge 150, centre (200, 100).
const start = { x: 100, y: 50, width: 200, height: 100 };
const resize = (
	handle: ResizeHandle,
	delta: { x: number; y: number },
	overrides: Partial<LayerResizeInput> = {},
) => computeLayerResize({ handle, start, delta, layerType: "image", minSize: 10, ...overrides });

describe("edge handles", () => {
	it("e moves only the right edge", () => {
		expect(resize("e", { x: 40, y: 30 }).rect).toEqual({ x: 100, y: 50, width: 240, height: 100 });
	});

	it("w moves only the left edge; the right edge stays", () => {
		expect(resize("w", { x: -40, y: 30 }).rect).toEqual({ x: 60, y: 50, width: 240, height: 100 });
	});

	it("s moves only the bottom edge", () => {
		expect(resize("s", { x: 25, y: 20 }).rect).toEqual({ x: 100, y: 50, width: 200, height: 120 });
	});

	it("n moves only the top edge; the bottom edge stays", () => {
		expect(resize("n", { x: 25, y: -20 }).rect).toEqual({ x: 100, y: 30, width: 200, height: 120 });
	});
});

describe("corner handles keep the aspect ratio and pin the opposite corner", () => {
	it("se pins the top-left corner", () => {
		expect(resize("se", { x: 100, y: 10 }).rect).toEqual({ x: 100, y: 50, width: 300, height: 150 });
	});

	it("nw pins the bottom-right corner", () => {
		expect(resize("nw", { x: -100, y: 0 }).rect).toEqual({ x: 0, y: 0, width: 300, height: 150 });
	});

	it("ne pins the bottom-left corner", () => {
		expect(resize("ne", { x: 0, y: -50 }).rect).toEqual({ x: 100, y: 0, width: 300, height: 150 });
	});

	it("sw pins the top-right corner", () => {
		expect(resize("sw", { x: 100, y: 0 }).rect).toEqual({ x: 200, y: 50, width: 100, height: 50 });
	});

	it("follows the axis the pointer moved further, relative to the box", () => {
		// x asks for 1.1×, y asks for 1.5×: y wins.
		expect(resize("se", { x: 20, y: 50 }).rect).toEqual({ x: 100, y: 50, width: 300, height: 150 });
	});
});

describe("modifiers", () => {
	it("shift frees the corner ratio", () => {
		expect(resize("se", { x: 100, y: 10 }, { modifiers: { shift: true } }).rect).toEqual({
			x: 100,
			y: 50,
			width: 300,
			height: 110,
		});
	});

	it("alt resizes an edge around the centre", () => {
		expect(resize("e", { x: 20, y: 0 }, { modifiers: { alt: true } }).rect).toEqual({
			x: 80,
			y: 50,
			width: 240,
			height: 100,
		});
	});

	it("alt resizes a corner around the centre, keeping the ratio", () => {
		expect(resize("se", { x: 50, y: 0 }, { modifiers: { alt: true } }).rect).toEqual({
			x: 50,
			y: 25,
			width: 300,
			height: 150,
		});
	});

	it("shift and alt together: free resize around the centre", () => {
		expect(resize("nw", { x: -10, y: -30 }, { modifiers: { shift: true, alt: true } }).rect).toEqual({
			x: 90,
			y: 20,
			width: 220,
			height: 160,
		});
	});
});

describe("minimum size", () => {
	it("an edge cannot collapse or invert; the opposite edge stays", () => {
		expect(resize("w", { x: 500, y: 0 }).rect).toEqual({ x: 290, y: 50, width: 10, height: 100 });
		expect(resize("s", { x: 0, y: -500 }).rect).toEqual({ x: 100, y: 50, width: 200, height: 10 });
	});

	it("a corner stops at the minimum while keeping the ratio", () => {
		// The height reaches 10 first, so the box is 20x10, pinned to the top-left.
		expect(resize("se", { x: -1000, y: -1000 }).rect).toEqual({ x: 100, y: 50, width: 20, height: 10 });
	});
});

describe("text layers", () => {
	const text = { layerType: "text" as const };

	it("a corner drag scales the font by the box factor", () => {
		const result = resize("se", { x: 100, y: 0 }, text);
		expect(result.rect.width).toBe(300);
		expect(result.fontScale).toBeCloseTo(1.5);
	});

	it("edges keep the font", () => {
		expect(resize("e", { x: 100, y: 0 }, text).fontScale).toBe(1);
		expect(resize("n", { x: 0, y: -40 }, text).fontScale).toBe(1);
	});

	it("a free (shift) corner keeps the font", () => {
		expect(resize("se", { x: 100, y: 10 }, { ...text, modifiers: { shift: true } }).fontScale).toBe(1);
	});

	it("non-text layers never scale a font", () => {
		expect(resize("se", { x: 100, y: 0 }).fontScale).toBe(1);
	});

	it("rounds the font size and clamps it to 8–400 px", () => {
		expect(scaleTextFontSize(32, 1.5)).toBe(48);
		expect(scaleTextFontSize(32, 1.07)).toBe(34);
		expect(scaleTextFontSize(32, 0.1)).toBe(8);
		expect(scaleTextFontSize(320, 2)).toBe(400);
	});
});

describe("react-rnd directions", () => {
	it("maps every direction to a handle", () => {
		expect(
			["top", "bottom", "left", "right", "topLeft", "topRight", "bottomLeft", "bottomRight"].map(
				handleFromRndDirection,
			),
		).toEqual(["n", "s", "w", "e", "nw", "ne", "sw", "se"]);
		expect(handleFromRndDirection("diagonal")).toBeNull();
	});
});
