export const TIMELINE_AXIS_HEIGHT_PX = 32;
export const TIMELINE_ROW_MIN_HEIGHT_PX = 28;
export const TIMELINE_VISIBLE_ROW_COUNT = 2;

function normalizeRowCount(rowCount: number) {
	if (!Number.isFinite(rowCount)) {
		return 0;
	}

	return Math.max(0, Math.floor(rowCount));
}

export function getTimelineRowsMinHeightPx(rowCount: number) {
	return normalizeRowCount(rowCount) * TIMELINE_ROW_MIN_HEIGHT_PX;
}

export function getTimelineContentMinHeightPx(rowCount: number) {
	return TIMELINE_AXIS_HEIGHT_PX + getTimelineRowsMinHeightPx(rowCount);
}

export function getTimelineViewportStretchFactor(rowCount: number) {
	const normalizedRowCount = normalizeRowCount(rowCount);

	if (normalizedRowCount <= 0) {
		return 1;
	}

	return Math.max(1, normalizedRowCount / TIMELINE_VISIBLE_ROW_COUNT);
}

/** Height of a regular row in px; with the 2px gap below it this is TIMELINE_ROW_MIN_HEIGHT_PX. */
export const TIMELINE_ROW_HEIGHT_PX = 26;
export const TIMELINE_ROW_GAP_PX = 2;
/** The thin drop-target row (the empty zoom lane). */
export const TIMELINE_THIN_ROW_HEIGHT_PX = 6;

/**
 * Size classes of a timeline row. Every row has a fixed height: the first version let rows share
 * the panel's free height (flex-1), so a timeline with only the clip row drew it far too tall, and
 * the thin zoom row grew on hover and while dragging, opening a gap under the clip row. A thin row
 * stays thin; it is still a drop target at that size.
 */
export function getTimelineRowSizeClassName(isThin: boolean): string {
	return isThin ? "h-1.5 flex-none" : "h-[26px] flex-none";
}
