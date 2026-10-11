import { useSyncExternalStore } from "react";

/**
 * Transient wallpaper shown on the canvas while the pointer rests on a background tile or
 * swatch. Like the layer hover preview it lives only in this store: it is not project data,
 * not part of the edit history (so no undo steps), never saved or autosaved, and the export
 * reads the real appearance state, so a hover value cannot reach the exported video.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function previewWallpaper(value: string) {
	if (current === value) return;
	current = value;
	emit();
}

export function clearWallpaperPreview() {
	if (current === null) return;
	current = null;
	emit();
}

export function getWallpaperPreview(): string | null {
	return current;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useWallpaperPreview(): string | null {
	return useSyncExternalStore(subscribe, getWallpaperPreview, getWallpaperPreview);
}

/** The wallpaper the editor preview should draw: the hovered one if any, else the real one. */
export function previewedWallpaper(real: string, preview: string | null): string {
	return preview ?? real;
}
