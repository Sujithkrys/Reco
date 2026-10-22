/** An autosave refreshes a project's preview at most this often. */
export const THUMBNAIL_REFRESH_MS = 120_000;

/**
 * Whether a save should capture a new project preview. A project with none captured yet in this
 * session always does (that is how new and old projects without one get theirs); after that the
 * preview is refreshed every THUMBNAIL_REFRESH_MS, so autosave does not re-render a frame each time.
 */
export function shouldCaptureThumbnail(
	lastCapturedAt: number | null | undefined,
	now: number,
	intervalMs = THUMBNAIL_REFRESH_MS,
): boolean {
	if (lastCapturedAt === null || lastCapturedAt === undefined || !Number.isFinite(lastCapturedAt)) return true;
	return now - lastCapturedAt >= intervalMs;
}
