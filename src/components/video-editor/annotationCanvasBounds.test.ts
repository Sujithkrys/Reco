import { describe, expect, it } from "vitest";
import {
	clampEdgesToCanvas,
	clampMoveToCanvas,
	fitRectToCanvas,
	getCanvasBoundsPercent,
} from "./annotationCanvasBounds";

// 1000x500 canvas with a 800x400 video rect at (100, 50): the background is
// 12.5% of the video width on each side and 12.5% of its height above/below.
const bounds = getCanvasBoundsPercent({ x: 100, y: 50, width: 800, height: 400 }, 1000, 500);

describe("annotation canvas bounds", () => {
	it("expresses the canvas edges in video-rect percent", () => {
		expect(bounds).toEqual({ minX: -12.5, minY: -12.5, maxX: 112.5, maxY: 112.5 });
	});

	it("move keeps the size and stops at the canvas edge", () => {
		expect(clampMoveToCanvas({ x: 100, y: -40, width: 30, height: 20 }, bounds)).toEqual({
			x: 82.5,
			y: -12.5,
			width: 30,
			height: 20,
		});
	});

	it("move pins a layer larger than the canvas to the near edge", () => {
		expect(clampMoveToCanvas({ x: 10, y: 10, width: 200, height: 20 }, bounds).x).toBe(-12.5);
	});

	it("resize past the right and bottom edges stops at the edges", () => {
		// Dragged the bottom-right handle 40% past the canvas.
		expect(clampEdgesToCanvas({ x: 80, y: 90, width: 72.5, height: 62.5 }, bounds)).toEqual({
			x: 80,
			y: 90,
			width: 32.5,
			height: 22.5,
		});
	});

	it("resize past the left and top edges keeps the opposite edges in place", () => {
		// Dragged the top-left handle to (-30, -30) while the right/bottom edges stayed at 40.
		expect(clampEdgesToCanvas({ x: -30, y: -30, width: 70, height: 70 }, bounds)).toEqual({
			x: -12.5,
			y: -12.5,
			width: 52.5,
			height: 52.5,
		});
	});

	it("leaves a rect already inside the canvas unchanged", () => {
		const rect = { x: -5, y: 100, width: 10, height: 10 };
		expect(clampEdgesToCanvas(rect, bounds)).toEqual(rect);
		expect(fitRectToCanvas(rect, bounds)).toEqual(rect);
	});

	it("after a canvas change, shifts a layer back in before shrinking it", () => {
		// Padding removed: the canvas is now exactly the video rect.
		const tight = getCanvasBoundsPercent({ x: 0, y: 0, width: 800, height: 400 }, 800, 400);
		expect(fitRectToCanvas({ x: -10, y: 95, width: 30, height: 10 }, tight)).toEqual({
			x: 0,
			y: 90,
			width: 30,
			height: 10,
		});
		expect(fitRectToCanvas({ x: -10, y: 0, width: 130, height: 10 }, tight)).toEqual({
			x: 0,
			y: 0,
			width: 100,
			height: 10,
		});
	});

	it("brings a layer that is entirely off canvas back inside", () => {
		const result = clampEdgesToCanvas({ x: 150, y: 150, width: 20, height: 10 }, bounds);
		expect(result).toEqual({ x: 92.5, y: 102.5, width: 20, height: 10 });
	});
});
