import { afterEach, describe, expect, it } from "vitest";
import {
	clearWallpaperPreview,
	getWallpaperPreview,
	previewedWallpaper,
	previewWallpaper,
} from "./wallpaperHoverPreview";

afterEach(() => clearWallpaperPreview());

describe("wallpaper hover preview", () => {
	it("shows the hovered wallpaper and reverts to the real one", () => {
		expect(previewedWallpaper("#111111", getWallpaperPreview())).toBe("#111111");
		previewWallpaper("#ff0000");
		expect(previewedWallpaper("#111111", getWallpaperPreview())).toBe("#ff0000");
		clearWallpaperPreview();
		expect(previewedWallpaper("#111111", getWallpaperPreview())).toBe("#111111");
	});

	it("never changes the real value it was given", () => {
		const real = "linear-gradient(to right, #000, #fff)";
		previewWallpaper("#ff0000");
		previewedWallpaper(real, getWallpaperPreview());
		expect(real).toBe("linear-gradient(to right, #000, #fff)");
	});
});
