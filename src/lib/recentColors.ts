import { normalizeHex } from "./colorUtils";

const STORAGE_KEY = "reco.recentColors";
export const MAX_RECENT_COLORS = 12;

/** Newest first; dedupes and caps. Pure so it can be tested without storage. */
export function pushRecentColor(list: string[], hex: string): string[] {
	const normalized = normalizeHex(hex);
	if (!normalized) return list;
	return [normalized, ...list.filter((color) => color !== normalized)].slice(0, MAX_RECENT_COLORS);
}

export function getRecentColors(): string[] {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((value) => (typeof value === "string" ? normalizeHex(value) : null))
			.filter((value): value is string => Boolean(value))
			.slice(0, MAX_RECENT_COLORS);
	} catch {
		return [];
	}
}

/** Records a colour as most recent and returns the updated list. Storage failures are ignored. */
export function addRecentColor(hex: string): string[] {
	const next = pushRecentColor(getRecentColors(), hex);
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Private mode or blocked storage: the list just doesn't persist.
	}
	return next;
}
