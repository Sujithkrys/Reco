import { describe, expect, it } from "vitest";
import {
	clamp,
	hexToHsva,
	hslToRgb,
	hsvaToHex,
	hsvToRgb,
	normalizeHex,
	parseChannel,
	parseHex,
	ringColorAt,
	ringHueAt,
	svColorAt,
	hueBarColorAt,
	rgbaToHex,
	rgbToHsl,
	rgbToHsv,
} from "./colorUtils";

describe("parseHex", () => {
	it("accepts 3, 4, 6 and 8 digits, with or without #", () => {
		expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
		expect(parseHex("0a0")).toEqual({ r: 0, g: 170, b: 0, a: 1 });
		expect(parseHex("#1A2B3C")).toEqual({ r: 26, g: 43, b: 60, a: 1 });
		expect(parseHex("ff000080")?.a).toBeCloseTo(128 / 255);
		expect(parseHex("#f008")).toMatchObject({ r: 255, g: 0, b: 0 });
	});

	it("rejects invalid input", () => {
		for (const bad of ["", "#", "#12", "#12345", "#1234567", "#ggg", "red", "#12 456", "#fffffffff"]) {
			expect(parseHex(bad)).toBeNull();
		}
		expect(parseHex(undefined as unknown as string)).toBeNull();
	});
});

describe("hex output", () => {
	it("writes lowercase six digits, and eight only when asked and translucent", () => {
		expect(rgbaToHex({ r: 255, g: 0, b: 10, a: 1 })).toBe("#ff000a");
		expect(rgbaToHex({ r: 255, g: 0, b: 10, a: 0.5 })).toBe("#ff000a");
		expect(rgbaToHex({ r: 255, g: 0, b: 10, a: 0.5 }, true)).toBe("#ff000a80");
		expect(rgbaToHex({ r: 255, g: 0, b: 10, a: 1 }, true)).toBe("#ff000a");
	});

	it("clamps out-of-range channels", () => {
		expect(rgbaToHex({ r: 300, g: -5, b: Number.NaN, a: 1 })).toBe("#ff0000");
	});

	it("normalises user input", () => {
		expect(normalizeHex("ABC")).toBe("#aabbcc");
		expect(normalizeHex("zzz")).toBeNull();
	});
});

describe("conversions", () => {
	it("converts primaries", () => {
		expect(rgbToHsv({ r: 255, g: 0, b: 0, a: 1 })).toEqual({ h: 0, s: 100, v: 100, a: 1 });
		expect(rgbToHsv({ r: 0, g: 255, b: 0, a: 1 }).h).toBe(120);
		expect(rgbToHsv({ r: 0, g: 0, b: 255, a: 1 }).h).toBe(240);
		expect(rgbToHsv({ r: 0, g: 0, b: 0, a: 1 })).toEqual({ h: 0, s: 0, v: 0, a: 1 });
		expect(rgbToHsl({ r: 255, g: 255, b: 255, a: 1 })).toMatchObject({ s: 0, l: 100 });
		expect(rgbToHsl({ r: 255, g: 0, b: 0, a: 1 })).toMatchObject({ h: 0, s: 100, l: 50 });
	});

	it("round trips every colour on a coarse grid through HSV and HSL", () => {
		for (let r = 0; r < 256; r += 51) {
			for (let g = 0; g < 256; g += 51) {
				for (let b = 0; b < 256; b += 51) {
					const rgba = { r, g, b, a: 1 };
					expect(hsvToRgb(rgbToHsv(rgba))).toEqual(rgba);
					expect(hslToRgb(rgbToHsl(rgba))).toEqual(rgba);
				}
			}
		}
	});

	it("round trips hex through HSV", () => {
		for (const hex of ["#2563eb", "#ff6b00", "#9b59b6", "#00bcd4", "#795548", "#000000", "#ffffff"]) {
			const hsva = hexToHsva(hex);
			expect(hsva).not.toBeNull();
			expect(hsvaToHex(hsva!)).toBe(hex);
		}
	});

	it("wraps hue and clamps saturation and value", () => {
		expect(hsvToRgb({ h: 360, s: 100, v: 100, a: 1 })).toEqual({ r: 255, g: 0, b: 0, a: 1 });
		expect(hsvToRgb({ h: -120, s: 100, v: 100, a: 1 })).toEqual({ r: 0, g: 0, b: 255, a: 1 });
		expect(hsvToRgb({ h: 0, s: 500, v: -5, a: 1 })).toEqual({ r: 0, g: 0, b: 0, a: 1 });
	});
});

describe("parseChannel / clamp", () => {
	it("clamps numbers and ignores text", () => {
		expect(parseChannel("128")).toBe(128);
		expect(parseChannel(" 300 ")).toBe(255);
		expect(parseChannel("-4")).toBe(0);
		expect(parseChannel("12.6")).toBe(13);
		expect(parseChannel("abc")).toBeNull();
		expect(parseChannel("")).toBeNull();
		expect(parseChannel("1e3")).toBeNull();
		expect(parseChannel("400", 0, 360)).toBe(360);
	});

	it("clamp treats non-finite as the minimum", () => {
		expect(clamp(Number.NaN, 0, 10)).toBe(0);
		expect(clamp(Infinity, 0, 10)).toBe(0);
		expect(clamp(5, 0, 10)).toBe(5);
	});
});

describe("colour at a point", () => {
	const base = { h: 200, s: 50, v: 50, a: 1 };

	it("saturation square: left is grey, right is full saturation, top is bright, bottom is black", () => {
		expect(svColorAt(base, 0, 0)).toEqual({ h: 200, s: 0, v: 100, a: 1 });
		expect(svColorAt(base, 1, 0)).toEqual({ h: 200, s: 100, v: 100, a: 1 });
		expect(svColorAt(base, 0.5, 1)).toEqual({ h: 200, s: 50, v: 0, a: 1 });
	});

	it("clamps points outside the control", () => {
		expect(svColorAt(base, -3, 7)).toEqual({ h: 200, s: 0, v: 0, a: 1 });
		expect(svColorAt(base, 9, -2)).toEqual({ h: 200, s: 100, v: 100, a: 1 });
	});

	it("hue bar: left is red, a third across is green, the far right stays below 360", () => {
		expect(hueBarColorAt(base, 0).h).toBe(0);
		expect(hueBarColorAt(base, 1 / 3).h).toBeCloseTo(120);
		expect(hueBarColorAt(base, 1).h).toBeLessThan(360);
		expect(hueBarColorAt(base, 0.5)).toMatchObject({ s: 50, v: 50 });
	});

	it("hue ring: top is red, right is 90, bottom is 180, left is 270", () => {
		expect(ringHueAt(0.5, 0)).toBeCloseTo(0);
		expect(ringHueAt(1, 0.5)).toBeCloseTo(90);
		expect(ringHueAt(0.5, 1)).toBeCloseTo(180);
		expect(ringHueAt(0, 0.5)).toBeCloseTo(270);
		expect(ringColorAt(base, 1, 0.5)).toMatchObject({ s: 50, v: 50, a: 1 });
	});
});
