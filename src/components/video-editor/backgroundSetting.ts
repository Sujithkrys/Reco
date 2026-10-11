import { DEFAULT_WALLPAPER_PATH } from "@/lib/wallpapers";

/** The wallpaper value an earlier version stored for "no background". Read only, never written. */
export const LEGACY_NO_BACKGROUND_WALLPAPER = "none";

export interface BackgroundSetting {
	wallpaper: string;
	backgroundEnabled: boolean;
}

/**
 * Reads the stored background pair. New data has a boolean switch next to the wallpaper, so the
 * wallpaper choice survives switching the background off. Old data that stored "none" as the
 * wallpaper becomes switch-off with the previous wallpaper if one is known, otherwise the default.
 * Everything else, including old projects without the switch, loads as before with it on.
 */
export function normalizeBackgroundSetting(
	wallpaper: unknown,
	backgroundEnabled: unknown,
	previousWallpaper?: string | null,
): BackgroundSetting {
	const stored = typeof wallpaper === "string" ? wallpaper : DEFAULT_WALLPAPER_PATH;
	if (stored === LEGACY_NO_BACKGROUND_WALLPAPER) {
		const restore =
			previousWallpaper && previousWallpaper !== LEGACY_NO_BACKGROUND_WALLPAPER
				? previousWallpaper
				: DEFAULT_WALLPAPER_PATH;
		return { wallpaper: restore, backgroundEnabled: false };
	}
	return {
		wallpaper: stored,
		backgroundEnabled: typeof backgroundEnabled === "boolean" ? backgroundEnabled : true,
	};
}
