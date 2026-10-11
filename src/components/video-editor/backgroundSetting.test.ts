import { describe, expect, it } from "vitest";
import { DEFAULT_WALLPAPER_PATH } from "@/lib/wallpapers";
import { normalizeBackgroundSetting } from "./backgroundSetting";
import { createProjectData, normalizeProjectEditor } from "./projectPersistence";

describe("normalizeBackgroundSetting", () => {
	it("keeps a stored wallpaper and defaults the switch to on for old projects", () => {
		expect(normalizeBackgroundSetting("/wallpapers/a.jpg", undefined)).toEqual({
			wallpaper: "/wallpapers/a.jpg",
			backgroundEnabled: true,
		});
	});

	it("keeps an explicit switch value", () => {
		expect(normalizeBackgroundSetting("#123456", false)).toEqual({ wallpaper: "#123456", backgroundEnabled: false });
		expect(normalizeBackgroundSetting("#123456", true).backgroundEnabled).toBe(true);
	});

	it("migrates the old stored value none to switch-off with the default wallpaper", () => {
		expect(normalizeBackgroundSetting("none", undefined)).toEqual({
			wallpaper: DEFAULT_WALLPAPER_PATH,
			backgroundEnabled: false,
		});
	});

	it("restores the previous wallpaper for an old none when one is known", () => {
		expect(normalizeBackgroundSetting("none", undefined, "#abcdef")).toEqual({
			wallpaper: "#abcdef",
			backgroundEnabled: false,
		});
		expect(normalizeBackgroundSetting("none", true, "none").wallpaper).toBe(DEFAULT_WALLPAPER_PATH);
	});

	it("falls back to the default wallpaper for a missing or non-string value", () => {
		expect(normalizeBackgroundSetting(undefined, undefined).wallpaper).toBe(DEFAULT_WALLPAPER_PATH);
		expect(normalizeBackgroundSetting(42, "yes")).toEqual({
			wallpaper: DEFAULT_WALLPAPER_PATH,
			backgroundEnabled: true,
		});
	});
});

describe("project round trip of the background switch", () => {
	it("keeps the wallpaper and the switch through save and load", () => {
		const editor = normalizeProjectEditor({ wallpaper: "/wallpapers/b.jpg", backgroundEnabled: false });
		const saved = JSON.parse(JSON.stringify(createProjectData("/v.webm", editor)));
		const loaded = normalizeProjectEditor(saved.editor);
		expect(loaded.wallpaper).toBe("/wallpapers/b.jpg");
		expect(loaded.backgroundEnabled).toBe(false);
	});

	it("loads an old project that stored none as switch-off", () => {
		const loaded = normalizeProjectEditor({ wallpaper: "none" });
		expect(loaded.backgroundEnabled).toBe(false);
		expect(loaded.wallpaper).toBe(DEFAULT_WALLPAPER_PATH);
	});

	it("loads other old projects unchanged, with the background on", () => {
		const loaded = normalizeProjectEditor({ wallpaper: "#123456" });
		expect(loaded.wallpaper).toBe("#123456");
		expect(loaded.backgroundEnabled).toBe(true);
	});
});
