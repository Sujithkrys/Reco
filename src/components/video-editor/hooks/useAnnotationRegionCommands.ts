import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import { heightForImageWidth, imageLayerSize, type NaturalSize } from "../imageLayerSize";
import { duplicateRegionAbove } from "../annotationDuplicate";
import { reorderedZIndexes } from "../layerKeyboard";
import type { TimelineSelectionKind } from "../state/timelineSelection";
import {
	applyTextStylePatch,
	compactTextRuns,
	plainTextOf,
	runsForNewText,
	runsOf,
	scaleTextLayer,
	type TextStylePatch,
} from "../textRuns";
import { textSelectionFor } from "../textSelectionStore";
import {
	type AnnotationRegion,
	type AnnotationType,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_FIGURE_DATA,
	DEFAULT_SHAPE_DATA,
	type FigureData,
	type ShapeData,
	type TextRun,
} from "../types";

interface UseAnnotationRegionCommandsParams {
	setAnnotationRegions: Dispatch<SetStateAction<AnnotationRegion[]>>;
	selectedAnnotationId: string | null;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	/** Deselects every other timeline item (selection is exclusive). */
	clearOtherSelections: (keep: TimelineSelectionKind) => void;
	nextAnnotationIdRef: MutableRefObject<number>;
	nextAnnotationZIndexRef: MutableRefObject<number>;
	/** Playhead and total timeline length, used to place image layers added from the panel. */
	playheadMs: number;
	totalMs: number;
		/** The video rect's width / height, to size image layers to their own ratio. */
		getVideoRectAspect?: () => number;
	}

export interface AddedImage {
	dataUrl: string;
		fileName: string;
		/** Natural pixel size, when known. */
		naturalSize?: NaturalSize | null;
	}

const IMAGE_LAYER_DEFAULT_DURATION_MS = 1000;
/** Diagonal offset between image layers added together, as percent of the video. */
const IMAGE_STACK_OFFSET_PERCENT = 3;

export function useAnnotationRegionCommands({
	setAnnotationRegions,
	selectedAnnotationId,
	setSelectedAnnotationId,
	clearOtherSelections,
	nextAnnotationIdRef,
	nextAnnotationZIndexRef,
	playheadMs,
	totalMs,
	getVideoRectAspect,
	}: UseAnnotationRegionCommandsParams) {
		const videoRectAspect = () => {
			const aspect = getVideoRectAspect?.();
			return aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
		};
	const handleAnnotationAdded = useCallback(
		(span: Span, trackIndex = 0, initialType: AnnotationType = "text") => {
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const newRegion: AnnotationRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				type: initialType,
				// Real empty content, not seed text: the settings panel's textarea
				// already has a proper HTML placeholder for this, and pre-filling
				// real text here meant typing appended after "Enter text..."
				// instead of replacing it.
				content: "",
				textContent: initialType === "text" ? "" : undefined,
				position: { ...DEFAULT_ANNOTATION_POSITION },
				size: { ...DEFAULT_ANNOTATION_SIZE },
				style: { ...DEFAULT_ANNOTATION_STYLE },
				zIndex: nextAnnotationZIndexRef.current++,
				trackIndex,
				...(initialType === "shape" ? { shapeData: { ...DEFAULT_SHAPE_DATA } } : {}),
				...(initialType === "figure" ? { figureData: { ...DEFAULT_FIGURE_DATA } } : {}),
			};
			setAnnotationRegions((current) => [...current, newRegion]);
			setSelectedAnnotationId(id);
			clearOtherSelections("annotation");
		},
		[
			clearOtherSelections,
			nextAnnotationIdRef,
			nextAnnotationZIndexRef,
			setAnnotationRegions,
			setSelectedAnnotationId,
		],
	);

	/**
	 * One image layer per file at the playhead, each offset diagonally from the last.
	 * An empty selected image layer takes the first file instead of being left blank.
	 * The last layer added ends up selected.
	 */
	const handleAnnotationImagesAdded = useCallback(
		(images: AddedImage[], reuseId?: string) => {
			if (images.length === 0) return;
			const duration = Math.max(0, Math.min(IMAGE_LAYER_DEFAULT_DURATION_MS, totalMs));
			const startMs = Math.round(
				Math.max(0, Math.min(playheadMs, Math.max(0, totalMs - duration))),
			);
			const endMs = Math.round(Math.min(startMs + duration, totalMs));
			const ids = images.map(() => `annotation-${nextAnnotationIdRef.current++}`);
			const zIndexes = images.map(() => nextAnnotationZIndexRef.current++);
			setAnnotationRegions((current) => {
				const reuse = current.find((region) => region.id === reuseId);
				const aspect = videoRectAspect();
				const basePosition = reuse?.position ?? DEFAULT_ANNOTATION_POSITION;
				const nextTrack =
					current.reduce((max, region) => Math.max(max, region.trackIndex ?? 0), -1) + 1;
				let reused = false;
				const next = current.map((region) => {
					if (!reuse || region.id !== reuse.id) return region;
					reused = true;
					// A blank layer is new to the user: size it to the image like any added layer.
					const fitted = imageLayerSize(images[0].naturalSize, aspect);
					return {
						...region,
						content: images[0].dataUrl,
						imageContent: images[0].dataUrl,
						imageFileName: images[0].fileName,
						...(fitted ? { size: fitted } : {}),
					};
				});
				const added: AnnotationRegion[] = [];
				images.forEach((image, index) => {
					if (index === 0 && reused) return;
					added.push({
						id: ids[index],
						startMs,
						endMs,
						type: "image",
						content: image.dataUrl,
						imageContent: image.dataUrl,
						imageFileName: image.fileName,
						position: {
							x: basePosition.x + index * IMAGE_STACK_OFFSET_PERCENT,
							y: basePosition.y + index * IMAGE_STACK_OFFSET_PERCENT,
						},
						size: imageLayerSize(image.naturalSize, aspect) ?? { ...DEFAULT_ANNOTATION_SIZE },
						style: { ...DEFAULT_ANNOTATION_STYLE },
						zIndex: zIndexes[index],
						trackIndex: nextTrack + added.length,
					});
				});
				return [...next, ...added];
			});
			// The reused layer (if any) holds the first file under its own id.
			const lastIndex = images.length - 1;
			setSelectedAnnotationId(lastIndex === 0 && reuseId ? reuseId : ids[lastIndex]);
			clearOtherSelections("annotation");
		},
		[
			clearOtherSelections,
			nextAnnotationIdRef,
			nextAnnotationZIndexRef,
			playheadMs,
			setAnnotationRegions,
			setSelectedAnnotationId,
			totalMs,
			getVideoRectAspect,
		],
	);

	/** A copy of the layer, offset a little and on top; the copy becomes the selection. */
		const handleAnnotationDuplicate = useCallback(
			(id: string) => {
				const newId = `annotation-${nextAnnotationIdRef.current++}`;
				const zIndex = nextAnnotationZIndexRef.current++;
				let created = false;
				setAnnotationRegions((current) => {
					const source = current.find((region) => region.id === id);
					if (!source) return current;
					created = true;
					return duplicateRegionAbove(source, current, newId, zIndex);
				});
				if (!created) return;
				setSelectedAnnotationId(newId);
				clearOtherSelections("annotation");
			},
			[
				clearOtherSelections,
				nextAnnotationIdRef,
				nextAnnotationZIndexRef,
				setAnnotationRegions,
				setSelectedAnnotationId,
			],
		);

		/** Moves a layer one place up or down in the stacking order. */
		const handleAnnotationReorder = useCallback(
			(id: string, direction: "up" | "down") => {
				setAnnotationRegions((current) => {
					const next = reorderedZIndexes(current, id, direction);
					if (!next) return current;
					return current.map((region) => ({ ...region, zIndex: next.get(region.id) ?? region.zIndex }));
				});
			},
			[setAnnotationRegions],
		);

		const handleAnnotationSpanChange = useCallback(
		(id: string, span: Span, trackIndex?: number) => {
			const normalizedTrackIndex =
				typeof trackIndex === "number" && Number.isFinite(trackIndex)
					? Math.max(0, Math.floor(trackIndex))
					: undefined;
			setAnnotationRegions((current) =>
				current.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
								...(normalizedTrackIndex === undefined
									? {}
									: { trackIndex: normalizedTrackIndex }),
							}
						: region,
				),
			);
		},
		[setAnnotationRegions],
	);

	const handleAnnotationDelete = useCallback(
		(id: string) => {
			setAnnotationRegions((current) => current.filter((region) => region.id !== id));
			if (selectedAnnotationId === id) setSelectedAnnotationId(null);
		},
		[selectedAnnotationId, setAnnotationRegions, setSelectedAnnotationId],
	);

	const handleAnnotationContentChange = useCallback(
		(id: string, content: string, imageFileName?: string | null, naturalSize?: NaturalSize | null) => {
			setAnnotationRegions((current) =>
				current.map((region) => {
					if (region.id !== id) return region;
					if (region.type === "text") {
						// The panel's plain textarea: keep the styles of the text that did not change.
						const textRuns = compactTextRuns(runsForNewText(runsOf(region), content, region.style), region.style);
						return { ...region, content, textContent: content, textRuns };
					}
					if (region.type === "image") {
						// Removing the image clears its file name; a new upload replaces it.
						const nextFileName =
							imageFileName !== undefined
								? (imageFileName ?? undefined)
								: content
									? region.imageFileName
									: undefined;
						// Replacing an image keeps the box width; the height follows the new image's ratio.
						const replacedHeight =
							content && region.content ? heightForImageWidth(region.size.width, naturalSize, videoRectAspect()) : null;
						return {
							...region,
							content,
							imageContent: content,
							imageFileName: nextFileName,
							...(replacedHeight ? { size: { ...region.size, height: replacedHeight } } : {}),
						};
					}
					return { ...region, content };
				}),
			);
		},
		[getVideoRectAspect, setAnnotationRegions],
	);

	const handleAnnotationTypeChange = useCallback(
		(id: string, type: AnnotationRegion["type"]) => {
			setAnnotationRegions((current) =>
				current.map((region) => {
					if (region.id !== id) return region;
					const updated = { ...region, type };
					if (type === "text") updated.content = region.textContent || "";
					else if (type === "image") updated.content = region.imageContent || "";
					else if (type === "figure") {
						updated.content = "";
						if (!region.figureData) updated.figureData = { ...DEFAULT_FIGURE_DATA };
					} else if (type === "shape") {
						updated.content = "";
						if (!region.shapeData) updated.shapeData = { ...DEFAULT_SHAPE_DATA };
					} else if (type === "blur") {
						updated.content = "";
						if (region.blurIntensity === undefined) updated.blurIntensity = 20;
					}
					return updated;
				}),
			);
		},
		[setAnnotationRegions],
	);

	const updateRegion = useCallback(
		(id: string, patch: Partial<AnnotationRegion>) => {
			setAnnotationRegions((current) =>
				current.map((region) => (region.id === id ? { ...region, ...patch } : region)),
			);
		},
		[setAnnotationRegions],
	);

	const handleAnnotationStyleChange = useCallback(
		(id: string, style: Partial<AnnotationRegion["style"]>) => {
			setAnnotationRegions((current) =>
				current.map((region) =>
					region.id === id ? { ...region, style: { ...region.style, ...style } } : region,
				),
			);
		},
		[setAnnotationRegions],
	);
	/** Rich text edited on the canvas: new runs, with the plain content kept in sync. */
	const handleAnnotationTextRunsChange = useCallback(
		(id: string, runs: TextRun[]) => {
			setAnnotationRegions((current) =>
				current.map((region) => {
					if (region.id !== id) return region;
					const content = plainTextOf(runs);
					return { ...region, content, textContent: content, textRuns: compactTextRuns(runs, region.style) };
				}),
			);
		},
		[setAnnotationRegions],
	);

	/**
	 * A text style change from the panel or toolbar: the selected text range when one is active
	 * on the canvas, otherwise the whole layer (as before rich text).
	 */
	const handleAnnotationTextStyleApply = useCallback(
		(id: string, patch: TextStylePatch) => {
			const range = textSelectionFor(id);
			setAnnotationRegions((current) =>
				current.map((region) =>
					region.id === id ? { ...region, ...applyTextStylePatch(region, patch, range) } : region,
				),
			);
		},
		[setAnnotationRegions],
	);

	/** Corner resize / Ctrl +/-: the layer's font and every run's font by the same factor. */
	const handleAnnotationTextScale = useCallback(
		(id: string, factor: number) => {
			setAnnotationRegions((current) =>
				current.map((region) =>
					region.id === id && region.type === "text" ? { ...region, ...scaleTextLayer(region, factor) } : region,
				),
			);
		},
		[setAnnotationRegions],
	);

	const handleAnnotationFigureDataChange = useCallback(
		(id: string, figureData: FigureData) => updateRegion(id, { figureData }),
		[updateRegion],
	);
	const handleAnnotationShapeDataChange = useCallback(
		(id: string, shapeData: Partial<ShapeData>) =>
			setAnnotationRegions((current) =>
				current.map((region) =>
					region.id === id
						? {
								...region,
								shapeData: { ...DEFAULT_SHAPE_DATA, ...region.shapeData, ...shapeData },
							}
						: region,
				),
			),
		[setAnnotationRegions],
	);
	const handleAnnotationBlurIntensityChange = useCallback(
		(id: string, blurIntensity: number) => updateRegion(id, { blurIntensity }),
		[updateRegion],
	);
	const handleAnnotationBlurColorChange = useCallback(
		(id: string, blurColor: string) => updateRegion(id, { blurColor }),
		[updateRegion],
	);
	const handleAnnotationPositionChange = useCallback(
		(id: string, position: { x: number; y: number }) => updateRegion(id, { position }),
		[updateRegion],
	);
	const handleAnnotationSizeChange = useCallback(
		(id: string, size: { width: number; height: number }) => updateRegion(id, { size }),
		[updateRegion],
	);

	return {
		handleAnnotationAdded,
		handleAnnotationImagesAdded,
				handleAnnotationDuplicate,
				handleAnnotationReorder,
				handleAnnotationSpanChange,
		handleAnnotationDelete,
		handleAnnotationContentChange,
		handleAnnotationTypeChange,
		handleAnnotationStyleChange,
		handleAnnotationTextRunsChange,
		handleAnnotationTextStyleApply,
		handleAnnotationTextScale,
		handleAnnotationFigureDataChange,
		handleAnnotationShapeDataChange,
		handleAnnotationBlurIntensityChange,
		handleAnnotationBlurColorChange,
		handleAnnotationPositionChange,
		handleAnnotationSizeChange,
	};
}
