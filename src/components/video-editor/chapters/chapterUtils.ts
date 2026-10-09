import type { SilenceInterval } from "../silenceRemoval/detectSilenceIntervals";
import { createTimelineRippleMapper } from "../silenceRemoval/planSilenceRemoval";
import type { ChapterMarker } from "./chapterTypes";

/**
 * Formats seconds into mm:ss or hh:mm:ss format.
 */
export function formatChapterTimestamp(timeMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	const paddedMin = minutes.toString().padStart(2, "0");
	const paddedSec = seconds.toString().padStart(2, "0");

	if (hours > 0) {
		const paddedHour = hours.toString().padStart(2, "0");
		return `${paddedHour}:${paddedMin}:${paddedSec}`;
	}

	return `${paddedMin}:${paddedSec}`;
}

/**
 * Formats a list of chapter markers into standard YouTube description format:
 * 00:00 Introduction
 * 01:23 Getting Started
 */
export function formatYouTubeChapters(chapters: ChapterMarker[]): string {
	if (!chapters || chapters.length === 0) {
		return "";
	}

	const sorted = [...chapters].sort((a, b) => a.timeMs - b.timeMs);

	// YouTube strictly requires the first chapter to start at 00:00
	const adjusted = sorted.map((ch, idx) => {
		if (idx === 0 && ch.timeMs !== 0) {
			return { ...ch, timeMs: 0 };
		}
		return ch;
	});

	return adjusted
		.map((ch) => `${formatChapterTimestamp(ch.timeMs)} ${ch.title.trim()}`)
		.join("\n");
}

/**
 * Validates and normalizes chapter markers returned from AI generation.
 */
export function sanitizeChapterMarkers(rawChapters: unknown[]): ChapterMarker[] {
	if (!Array.isArray(rawChapters)) {
		return [];
	}

	const valid: ChapterMarker[] = [];

	for (const item of rawChapters) {
		if (typeof item !== "object" || item === null) continue;
		const anyItem = item as Record<string, unknown>;

		const timeMs = Number(anyItem.timeMs ?? anyItem.timestampMs ?? 0);
		const title = String(anyItem.title || "").trim();

		if (Number.isFinite(timeMs) && title.length > 0) {
			valid.push({
				id: typeof anyItem.id === "string" ? anyItem.id : globalThis.crypto.randomUUID(),
				timeMs: Math.max(0, Math.round(timeMs)),
				title,
			});
		}
	}

	// Sort chronologically
	valid.sort((a, b) => a.timeMs - b.timeMs);

	// Ensure the first chapter starts at 0ms
	if (valid.length > 0 && valid[0].timeMs !== 0) {
		valid[0].timeMs = 0;
	}

	return valid;
}

/**
 * Shifts chapter markers when silence removal / smart cut is executed.
 */
export function rippleShiftChapters(
	chapters: ChapterMarker[],
	silenceIntervals: SilenceInterval[],
	totalDurationMs: number,
): ChapterMarker[] {
	if (chapters.length === 0 || silenceIntervals.length === 0) {
		return chapters;
	}

	const mapTime = createTimelineRippleMapper(silenceIntervals, totalDurationMs);
	const shifted: ChapterMarker[] = [];

	for (let i = 0; i < chapters.length; i++) {
		const ch = chapters[i];
		// Chapter 0 always stays at 0
		if (i === 0) {
			shifted.push({ ...ch, timeMs: 0 });
			continue;
		}

		const mapped = mapTime(ch.timeMs);
		shifted.push({
			...ch,
			timeMs: mapped.newMs,
		});
	}

	// De-duplicate any timestamps that collapsed onto the exact same millisecond
	const unique: ChapterMarker[] = [];
	for (const ch of shifted) {
		if (!unique.some((u) => Math.abs(u.timeMs - ch.timeMs) < 100)) {
			unique.push(ch);
		}
	}

	return unique;
}
