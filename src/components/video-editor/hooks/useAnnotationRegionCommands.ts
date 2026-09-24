import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
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
} from "../types";

interface UseAnnotationRegionCommandsParams {
	setAnnotationRegions: Dispatch<SetStateAction<AnnotationRegion[]>>;
	selectedAnnotationId: string | null;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	nextAnnotationIdRef: MutableRefObject<number>;
	nextAnnotationZIndexRef: MutableRefObject<number>;
}

export function useAnnotationRegionCommands({
	setAnnotationRegions,
	selectedAnnotationId,
	setSelectedAnnotationId,
	setSelectedZoomId,
	nextAnnotationIdRef,
	nextAnnotationZIndexRef,
}: UseAnnotationRegionCommandsParams) {
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
			setSelectedZoomId(null);
		},
		[
			nextAnnotationIdRef,
			nextAnnotationZIndexRef,
			setAnnotationRegions,
			setSelectedAnnotationId,
			setSelectedZoomId,
		],
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
		(id: string, content: string) => {
			setAnnotationRegions((current) =>
				current.map((region) => {
					if (region.id !== id) return region;
					if (region.type === "text") return { ...region, content, textContent: content };
					if (region.type === "image")
						return { ...region, content, imageContent: content };
					return { ...region, content };
				}),
			);
		},
		[setAnnotationRegions],
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
		handleAnnotationSpanChange,
		handleAnnotationDelete,
		handleAnnotationContentChange,
		handleAnnotationTypeChange,
		handleAnnotationStyleChange,
		handleAnnotationFigureDataChange,
		handleAnnotationShapeDataChange,
		handleAnnotationBlurIntensityChange,
		handleAnnotationBlurColorChange,
		handleAnnotationPositionChange,
		handleAnnotationSizeChange,
	};
}
