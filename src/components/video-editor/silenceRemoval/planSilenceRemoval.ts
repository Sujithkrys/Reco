import type {
	AnnotationRegion,
	AudioRegion,
	CaptionCue,
	ClipRegion,
	ZoomRegion,
} from "../types";
import { getAudioSourceStartMs } from "../types";
import type { SilenceInterval } from "./detectSilenceIntervals";

export interface SilenceRemovalImpact {
	/** Total milliseconds removed. */
	timeSavedMs: number;
	/** Count of silence intervals being excised. */
	silenceCount: number;
	/** New total duration in milliseconds. */
	newTotalDurationMs: number;
	/** Count of zoom regions that will be completely deleted because they fall inside cut sections. */
	removedZoomCount: number;
	/** Count of annotations that will be completely deleted because they fall inside cut sections. */
	removedAnnotationCount: number;
	/** Count of captions that will be deleted because they fall inside cut sections. */
	removedCaptionCount: number;
	/** Labels / descriptions of removed annotations for explicit disclosure. */
	removedAnnotationDescriptions: string[];
}

export interface SilenceRemovalPlan {
	impact: SilenceRemovalImpact;
	newClipRegions: ClipRegion[];
	newZoomRegions: ZoomRegion[];
	newAnnotationRegions: AnnotationRegion[];
	newAudioRegions: AudioRegion[];
	newCaptionCues: CaptionCue[];
}

export interface PlanSilenceRemovalParams {
	clipRegions: ClipRegion[];
	zoomRegions: ZoomRegion[];
	annotationRegions: AnnotationRegion[];
	audioRegions: AudioRegion[];
	captionCues?: CaptionCue[];
	silenceIntervals: SilenceInterval[];
	totalDurationMs: number;
	preserveContinuousAudio?: boolean;
	createClipId?: () => string;
}

/**
 * Maps a timestamp from the original timeline to the new rippled timeline after silence removal.
 */
export function createTimelineRippleMapper(
	silenceIntervals: SilenceInterval[],
	totalDurationMs: number,
) {
	// Ensure intervals are sorted
	const sorted = [...silenceIntervals].sort((a, b) => a.startMs - b.startMs);

	return function mapTime(oldMs: number): { newMs: number; insideCut: boolean } {
		let cutAccumulator = 0;
		for (const cut of sorted) {
			if (oldMs >= cut.startMs && oldMs <= cut.endMs) {
				// The timestamp falls directly inside a cut segment
				return {
					newMs: Math.max(0, cut.startMs - cutAccumulator),
					insideCut: true,
				};
			}
			if (oldMs > cut.endMs) {
				cutAccumulator += cut.durationMs;
			} else {
				break;
			}
		}

		return {
			newMs: Math.max(0, oldMs - cutAccumulator),
			insideCut: false,
		};
	};
}

/**
 * Plans the complete silence removal operation across all timeline tracks,
 * calculating exact content deletion disclosure numbers.
 */
export function planSilenceRemoval(params: PlanSilenceRemovalParams): SilenceRemovalPlan {
	const {
		clipRegions,
		zoomRegions,
		annotationRegions,
		audioRegions,
		captionCues = [],
		silenceIntervals,
		totalDurationMs,
		preserveContinuousAudio = true,
		createClipId = () => `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
	} = params;

	if (silenceIntervals.length === 0 || totalDurationMs <= 0) {
		return {
			impact: {
				timeSavedMs: 0,
				silenceCount: 0,
				newTotalDurationMs: totalDurationMs,
				removedZoomCount: 0,
				removedAnnotationCount: 0,
				removedCaptionCount: 0,
				removedAnnotationDescriptions: [],
			},
			newClipRegions: clipRegions,
			newZoomRegions: zoomRegions,
			newAnnotationRegions: annotationRegions,
			newAudioRegions: audioRegions,
			newCaptionCues: captionCues,
		};
	}

	// 1. Sort silence intervals and compute total time saved
	const sortedCuts = [...silenceIntervals].sort((a, b) => a.startMs - b.startMs);
	const timeSavedMs = sortedCuts.reduce((acc, cut) => acc + cut.durationMs, 0);
	const newTotalDurationMs = Math.max(0, totalDurationMs - timeSavedMs);
	const mapTime = createTimelineRippleMapper(sortedCuts, totalDurationMs);

	// 2. Compute "keep intervals" (the audible pieces to preserve)
	const keepIntervals: { startMs: number; endMs: number }[] = [];
	let currentPos = 0;

	for (const cut of sortedCuts) {
		if (cut.startMs > currentPos) {
			keepIntervals.push({ startMs: currentPos, endMs: cut.startMs });
		}
		currentPos = Math.max(currentPos, cut.endMs);
	}

	if (currentPos < totalDurationMs) {
		keepIntervals.push({ startMs: currentPos, endMs: totalDurationMs });
	}

	// 3. Construct new contiguous ClipRegions from keepIntervals
	const newClipRegions: ClipRegion[] = [];
	let timelineCursor = 0;

	// Helper to find original sourceStartMs for a given timeline timestamp
	const findSourceTime = (timelineMs: number): number => {
		const clip = clipRegions.find((c) => timelineMs >= c.startMs && timelineMs <= c.endMs);
		if (!clip) return timelineMs;
		const offset = timelineMs - clip.startMs;
		const speed = clip.speed ?? 1;
		return (clip.sourceStartMs ?? clip.startMs) + offset * speed;
	};

	for (const keep of keepIntervals) {
		const duration = keep.endMs - keep.startMs;
		if (duration <= 0) continue;

		const sourceStart = findSourceTime(keep.startMs);

		newClipRegions.push({
			id: createClipId(),
			startMs: timelineCursor,
			endMs: timelineCursor + duration,
			sourceStartMs: sourceStart,
			speed: 1,
		});

		timelineCursor += duration;
	}

	// 4. Audit impacted Zoom Regions
	let removedZoomCount = 0;
	const newZoomRegions: ZoomRegion[] = [];

	for (const zoom of zoomRegions) {
		// Check if entirely within any cut
		const entirelyInside = sortedCuts.some(
			(cut) => zoom.startMs >= cut.startMs && zoom.endMs <= cut.endMs,
		);

		if (entirelyInside) {
			removedZoomCount++;
			continue;
		}

		const mappedStart = mapTime(zoom.startMs).newMs;
		const mappedEnd = mapTime(zoom.endMs).newMs;

		if (mappedEnd > mappedStart) {
			newZoomRegions.push({
				...zoom,
				startMs: mappedStart,
				endMs: mappedEnd,
			});
		} else {
			removedZoomCount++;
		}
	}

	// 5. Audit impacted Annotation Regions
	let removedAnnotationCount = 0;
	const removedAnnotationDescriptions: string[] = [];
	const newAnnotationRegions: AnnotationRegion[] = [];

	for (const annotation of annotationRegions) {
		const entirelyInside = sortedCuts.some(
			(cut) => annotation.startMs >= cut.startMs && annotation.endMs <= cut.endMs,
		);

		if (entirelyInside) {
			removedAnnotationCount++;
			const desc = annotation.content
				? `"${annotation.content.slice(0, 20)}..." (${annotation.type})`
				: annotation.type;
			removedAnnotationDescriptions.push(desc);
			continue;
		}

		const mappedStart = mapTime(annotation.startMs).newMs;
		const mappedEnd = mapTime(annotation.endMs).newMs;

		if (mappedEnd > mappedStart) {
			newAnnotationRegions.push({
				...annotation,
				startMs: mappedStart,
				endMs: mappedEnd,
			});
		} else {
			removedAnnotationCount++;
			removedAnnotationDescriptions.push(annotation.type);
		}
	}

	// 6. Audit impacted Captions
	let removedCaptionCount = 0;
	const newCaptionCues: CaptionCue[] = [];

	for (const cue of captionCues) {
		const entirelyInside = sortedCuts.some(
			(cut) => cue.startMs >= cut.startMs && cue.endMs <= cut.endMs,
		);

		if (entirelyInside) {
			removedCaptionCount++;
			continue;
		}

		const mappedStart = mapTime(cue.startMs).newMs;
		const mappedEnd = mapTime(cue.endMs).newMs;

		if (mappedEnd > mappedStart) {
			newCaptionCues.push({
				...cue,
				startMs: mappedStart,
				endMs: mappedEnd,
				words: cue.words
					?.map((w) => ({
						...w,
						startMs: mapTime(w.startMs).newMs,
						endMs: mapTime(w.endMs).newMs,
					}))
					.filter((w) => w.endMs > w.startMs),
			});
		} else {
			removedCaptionCount++;
		}
	}

	// 7. Handle Audio Regions (Continuous Music Preservation)
	const newAudioRegions: AudioRegion[] = [];

	for (const audio of audioRegions) {
		if (preserveContinuousAudio) {
			// Continuous: shift start only by cuts that occurred before this track, and clamp endMs to new total duration
			const cutsBefore = sortedCuts.filter((c) => c.endMs <= audio.startMs);
			const shift = cutsBefore.reduce((acc, c) => acc + c.durationMs, 0);
			const newStart = Math.max(0, audio.startMs - shift);
			const originalDuration = audio.endMs - audio.startMs;
			const newEnd = Math.min(newTotalDurationMs, newStart + originalDuration);

			if (newEnd > newStart) {
				newAudioRegions.push({
					...audio,
					startMs: newStart,
					endMs: newEnd,
				});
			}
		} else {
			// Sliced ripple
			const mappedStart = mapTime(audio.startMs).newMs;
			const mappedEnd = mapTime(audio.endMs).newMs;
			if (mappedEnd > mappedStart) {
				// Cuts covering the head of the region remove that audio too, so the
				// region now starts reading where the first kept moment was.
				let removedUntilMs = audio.startMs;
				for (const cut of sortedCuts) {
					if (cut.startMs <= removedUntilMs && cut.endMs > removedUntilMs) {
						removedUntilMs = cut.endMs;
					}
				}
				const headRemovedMs = Math.max(
					0,
					Math.min(removedUntilMs, audio.endMs) - audio.startMs,
				);
				newAudioRegions.push({
					...audio,
					startMs: mappedStart,
					endMs: mappedEnd,
					sourceStartMs: getAudioSourceStartMs(audio) + headRemovedMs,
				});
			}
		}
	}

	return {
		impact: {
			timeSavedMs,
			silenceCount: sortedCuts.length,
			newTotalDurationMs,
			removedZoomCount,
			removedAnnotationCount,
			removedCaptionCount,
			removedAnnotationDescriptions,
		},
		newClipRegions,
		newZoomRegions,
		newAnnotationRegions,
		newAudioRegions,
		newCaptionCues,
	};
}
