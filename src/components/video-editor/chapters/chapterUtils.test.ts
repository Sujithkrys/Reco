import { describe, expect, it } from "vitest";
import {
	formatChapterTimestamp,
	formatYouTubeChapters,
	rippleShiftChapters,
	sanitizeChapterMarkers,
} from "./chapterUtils";
import type { ChapterMarker } from "./chapterTypes";

describe("chapterUtils", () => {
	describe("formatChapterTimestamp", () => {
		it("formats seconds into mm:ss", () => {
			expect(formatChapterTimestamp(0)).toBe("00:00");
			expect(formatChapterTimestamp(65000)).toBe("01:05");
			expect(formatChapterTimestamp(599000)).toBe("09:59");
		});

		it("formats timestamps >= 1 hour into hh:mm:ss", () => {
			expect(formatChapterTimestamp(3665000)).toBe("01:01:05");
		});
	});

	describe("formatYouTubeChapters", () => {
		it("formats chapter markers into YouTube description format", () => {
			const chapters: ChapterMarker[] = [
				{ id: "1", timeMs: 0, title: "Introduction" },
				{ id: "2", timeMs: 75000, title: "Overview" },
				{ id: "3", timeMs: 180000, title: "Wrap Up" },
			];

			const result = formatYouTubeChapters(chapters);
			expect(result).toBe("00:00 Introduction\n01:15 Overview\n03:00 Wrap Up");
		});

		it("ensures first chapter is strictly pinned to 00:00 for YouTube compliance", () => {
			const chapters: ChapterMarker[] = [
				{ id: "1", timeMs: 5000, title: "Intro" },
				{ id: "2", timeMs: 60000, title: "Topic 1" },
			];

			const result = formatYouTubeChapters(chapters);
			expect(result).toBe("00:00 Intro\n01:00 Topic 1");
		});
	});

	describe("sanitizeChapterMarkers", () => {
		it("validates, sorts and clamps raw AI response items", () => {
			const raw = [
				{ timeMs: 120000, title: "Third Topic" },
				{ timeMs: 25000, title: "First Topic" },
				{ timeMs: "invalid", title: "Ignored" },
				{ timeMs: 60000, title: "Second Topic" },
			];

			const sanitized = sanitizeChapterMarkers(raw);
			expect(sanitized.length).toBe(3);
			expect(sanitized[0].title).toBe("First Topic");
			expect(sanitized[0].timeMs).toBe(0); // Clamped to 0
			expect(sanitized[1].title).toBe("Second Topic");
			expect(sanitized[1].timeMs).toBe(60000);
			expect(sanitized[2].title).toBe("Third Topic");
			expect(sanitized[2].timeMs).toBe(120000);
		});
	});

	describe("rippleShiftChapters", () => {
		it("shifts chapter markers when silence cuts occur", () => {
			const chapters: ChapterMarker[] = [
				{ id: "1", timeMs: 0, title: "Intro" },
				{ id: "2", timeMs: 5000, title: "Topic A" },
				{ id: "3", timeMs: 12000, title: "Topic B" },
			];

			// Silence cut from 2000 to 4000 (2000ms duration)
			const silences = [{ startMs: 2000, endMs: 4000, durationMs: 2000 }];

			const shifted = rippleShiftChapters(chapters, silences, 20000);
			expect(shifted.length).toBe(3);
			expect(shifted[0].timeMs).toBe(0);
			expect(shifted[1].timeMs).toBe(3000); // 5000 - 2000
			expect(shifted[2].timeMs).toBe(10000); // 12000 - 2000
		});
	});
});
