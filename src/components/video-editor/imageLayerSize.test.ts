import { describe, expect, it } from "vitest";
import { heightForImageWidth, imageLayerSize } from "./imageLayerSize";

describe("imageLayerSize", () => {
	it("makes a wide image 30% of the video width with its own ratio", () => {
		// 16:9 video rect, 2:1 image: 30% wide, 15% of the width tall = 26.67% of the height.
		const size = imageLayerSize({ width: 2000, height: 1000 }, 16 / 9);
		expect(size?.width).toBeCloseTo(30);
		expect(size?.height).toBeCloseTo(15 * (16 / 9));
	});

	it("makes a tall image 30% of the video width tall", () => {
		const size = imageLayerSize({ width: 1000, height: 2000 }, 16 / 9);
		expect(size?.height).toBeCloseTo(30 * (16 / 9));
		expect(size?.width).toBeCloseTo(15);
	});

	it("keeps the pixel ratio on screen for any video aspect", () => {
		for (const aspect of [16 / 9, 4 / 3, 1, 9 / 16]) {
			const size = imageLayerSize({ width: 300, height: 200 }, aspect)!;
			// On-screen width : height in video-rect units.
			const screenRatio = (size.width / 100) / (size.height / 100 / aspect);
			expect(screenRatio).toBeCloseTo(1.5);
		}
	});

	it("makes a square image square", () => {
		const size = imageLayerSize({ width: 500, height: 500 }, 16 / 9)!;
		expect(size.width).toBeCloseTo(30);
		expect(size.height).toBeCloseTo(30 * (16 / 9));
	});

	it("returns null for unusable input", () => {
		expect(imageLayerSize({ width: 0, height: 10 }, 1.7)).toBeNull();
		expect(imageLayerSize(null, 1.7)).toBeNull();
		expect(imageLayerSize({ width: 10, height: 10 }, 0)).toBeNull();
		expect(imageLayerSize({ width: Number.NaN, height: 10 }, 1.7)).toBeNull();
	});
});

describe("heightForImageWidth", () => {
	it("keeps the width and follows the new ratio", () => {
		// 40% wide on a 16:9 rect, 2:1 image: 20% of the width tall.
		expect(heightForImageWidth(40, { width: 200, height: 100 }, 16 / 9)).toBeCloseTo(20 * (16 / 9));
	});

	it("returns null for unusable input", () => {
		expect(heightForImageWidth(40, null, 1.7)).toBeNull();
		expect(heightForImageWidth(40, { width: 10, height: 10 }, Number.NaN)).toBeNull();
	});
});
