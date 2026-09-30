import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
		},
	},
}));

import type { CaptionCue } from "../types";
import type { ChapterMarker } from "./chapterTypes";
import {
	formatChapterTimestamp,
	formatYouTubeChapters,
	rippleShiftChapters,
	sanitizeChapterMarkers,
} from "./chapterUtils";
import { generateAutoChapters } from "./chaptersService";

// Realistic transcript samples derived from a video walkthrough / sample.mp4
const SAMPLE_TRANSCRIPT: CaptionCue[] = [
	{
		id: "cue-1",
		startMs: 0,
		endMs: 8500,
		text: "Welcome to this complete walkthrough of our video recording and editing workflow.",
	},
	{
		id: "cue-2",
		startMs: 8600,
		endMs: 19000,
		text: "First, let's explore how automatic screen capture and audio telemetry are recorded in real-time.",
	},
	{
		id: "cue-3",
		startMs: 19200,
		endMs: 38000,
		text: "Next, we will take a deep dive into smart silence removal and timeline ripple cuts.",
	},
	{
		id: "cue-4",
		startMs: 38500,
		endMs: 55000,
		text: "Now, let's look at setting up auto-generated chapter markers and formatting them for YouTube.",
	},
	{
		id: "cue-5",
		startMs: 55500,
		endMs: 72000,
		text: "Finally, we conclude with uncapped high-resolution export settings and wrap up.",
	},
];

describe("Chapters End-to-End Pipeline", () => {
	it("processes realistic transcript into valid, sorted, and YouTube-compliant chapter markers", () => {
		// Mock response that GPT-4o-mini would return from the formatted transcript
		const rawAiResponse = [
			{ timeMs: 0, title: "Introduction & Overview" },
			{ timeMs: 8600, title: "Screen Capture & Audio Telemetry" },
			{ timeMs: 19200, title: "Smart Silence Removal" },
			{ timeMs: 38500, title: "Auto-Chapter Markers" },
			{ timeMs: 55500, title: "Export Settings & Conclusion" },
		];

		const chapters = sanitizeChapterMarkers(rawAiResponse);

		expect(chapters).toHaveLength(5);
		expect(chapters[0].timeMs).toBe(0);
		expect(chapters[0].title).toBe("Introduction & Overview");
		expect(chapters[4].title).toBe("Export Settings & Conclusion");

		// Format for YouTube description
		const youtubeText = formatYouTubeChapters(chapters);

		expect(youtubeText).toBe(
			"00:00 Introduction & Overview\n" +
			"00:08 Screen Capture & Audio Telemetry\n" +
			"00:19 Smart Silence Removal\n" +
			"00:38 Auto-Chapter Markers\n" +
			"00:55 Export Settings & Conclusion"
		);
	});

	it("strictly requires first chapter to be 00:00 even if raw AI model misses 0", () => {
		const rawAiResponse = [
			{ timeMs: 4200, title: "Welcome & Setup" },
			{ timeMs: 25000, title: "Keyframe Zooming" },
		];

		const chapters = sanitizeChapterMarkers(rawAiResponse);
		expect(chapters[0].timeMs).toBe(0);
		expect(chapters[0].title).toBe("Welcome & Setup");

		const youtubeText = formatYouTubeChapters(chapters);
		expect(youtubeText.startsWith("00:00")).toBe(true);
	});

	it("ripples chapter timestamps accurately across multiple silence cuts", () => {
		const initialChapters: ChapterMarker[] = [
			{ id: "c1", timeMs: 0, title: "Intro" },
			{ id: "c2", timeMs: 10000, title: "Section 1" },
			{ id: "c3", timeMs: 30000, title: "Section 2" },
			{ id: "c4", timeMs: 60000, title: "Section 3" },
		];

		// User runs Smart Cut:
		// Cut 1: 5000 to 8000 (3000ms duration)
		// Cut 2: 20000 to 25000 (5000ms duration)
		const silenceCuts = [
			{ startMs: 5000, endMs: 8000, durationMs: 3000 },
			{ startMs: 20000, endMs: 25000, durationMs: 5000 },
		];

		const rippled = rippleShiftChapters(initialChapters, silenceCuts, 70000);

		expect(rippled[0].timeMs).toBe(0);
		// c2 at 10000 -> shifted by 3000ms cut -> 7000ms
		expect(rippled[1].timeMs).toBe(7000);
		// c3 at 30000 -> shifted by (3000 + 5000) = 8000ms -> 22000ms
		expect(rippled[2].timeMs).toBe(22000);
		// c4 at 60000 -> shifted by 8000ms -> 52000ms
		expect(rippled[3].timeMs).toBe(52000);
	});

	it("enforces authentication gate before making network requests", async () => {
		// Mock supabase to return null session (unauthenticated)
		const res = await generateAutoChapters({
			transcript: SAMPLE_TRANSCRIPT,
		});

		expect(res.success).toBe(false);
		expect(res.error).toMatch(/sign in/i);
	});
});
