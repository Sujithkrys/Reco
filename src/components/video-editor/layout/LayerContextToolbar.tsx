import {
	ArrowLineLeft,
	ArrowLineRight,
	ArrowUpRight,
	BoundingBox,
	Circle,
	Crosshair,
	DotsThree,
	Drop,
	Highlighter,
	ImageSquare,
	LineSegment,
	MagnifyingGlassPlus,
	PaintBucket,
	Palette,
	Rectangle,
	SpeakerHigh,
	TextAa,
	TextAlignCenter,
	TextAlignLeft,
	TextAlignRight,
	TextB,
	TextItalic,
	TextUnderline,
	Trash,
	XCircle,
} from "@phosphor-icons/react";
import { AnnotationColorBlock } from "../AnnotationColorBlock";
import { loadImageSize } from "../imageLayerSize";
import { collectProjectColors } from "../projectColors";
import {
	type AnnotationPreviewPatch,
	clearAnnotationPreview,
	previewAnnotation,
} from "../annotationHoverPreview";
import { type ReactNode, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ANNOTATION_COLOR_PALETTE, fontSizeOptions } from "../AnnotationSettingsPanel";
import { getArrowComponent } from "../ArrowSvgs";
import type { useAnnotationRegionCommands } from "../hooks/useAnnotationRegionCommands";
import type { useAudioRegionCommands } from "../hooks/useAudioRegionCommands";
import type { PlayheadTrimEdge } from "../hooks/usePlayheadEditCommands";
import type { useZoomRegionCommands } from "../hooks/useZoomRegionCommands";
import type { PlayheadEditTarget } from "../playheadEdits";
import { ZOOM_DEPTH_OPTIONS } from "../SettingsPanel";
import {
	type AnnotationRegion,
	ARROW_DIRECTIONS,
	type AudioRegion,
	BLUR_ANNOTATION_STRENGTH,
	DEFAULT_FIGURE_DATA,
	DEFAULT_SHAPE_DATA,
	type ZoomRegion,
} from "../types";
import { MIXED, plainTextOf, runsOf, styleSummary, type TextStylePatch } from "../textRuns";
import { useTextSelection } from "../textSelectionStore";
import { fitToolbarItems } from "./layerToolbarFit";

const BUTTON_CLASS =
	"h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground";
const POPOVER_CLASS =
	"w-[240px] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-3 bg-editor-surface-alt border border-foreground/10 rounded-xl shadow-xl";
const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

interface ToolbarItem {
	key: string;
	kind: "action" | "popover";
	label: string;
	icon: ReactNode;
	onSelect?: () => void;
	disabled?: boolean;
	/** Tooltip text; defaults to label. */
	tooltip?: string;
	popover?: ReactNode;
}

type Props = {
	/** Free width between the existing buttons and the playback controls. */
	availableWidth: number;
	target: PlayheadEditTarget | null;
	selectedAnnotation: AnnotationRegion | null;
	/** All layers, for the "in this project" colours. */
	annotationRegions: AnnotationRegion[];
	selectedZoom: ZoomRegion | null;
	selectedAudio: AudioRegion | null;
	selectedClipId: string | null;
	trimCount: (edge: PlayheadTrimEdge) => number;
	onTrim: (edge: PlayheadTrimEdge) => void;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	zoomCommands: ReturnType<typeof useZoomRegionCommands>;
	audioCommands: ReturnType<typeof useAudioRegionCommands>;
	onDeleteClip: (id: string) => void;
};

function ColorSwatches({
	id,
	color,
	onChange,
	toPatch,
	projectColors,
	onClear,
	clearLabel,
}: {
	id: string;
	color: string;
	projectColors?: string[];
	onClear?: () => void;
	clearLabel?: string;
	onChange: (hex: string) => void;
	/** The hover preview for a swatch; nothing is applied until it is clicked. */
	toPatch: (hex: string) => AnnotationPreviewPatch;
}) {
	return (
		<AnnotationColorBlock
			color={color}
			colors={ANNOTATION_COLOR_PALETTE}
			projectColors={projectColors}
			onClear={onClear}
			clearLabel={clearLabel}
			onChange={onChange}
			onPreview={(hex) => (hex ? previewAnnotation(id, toPatch(hex)) : clearAnnotationPreview())}
		/>
	);
}

function RangeRow({
	label,
	value,
	min,
	max,
	step = 1,
	format = (v: number) => String(v),
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	format?: (value: number) => string;
	onChange: (value: number) => void;
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between text-xs">
				<span className="text-muted-foreground">{label}</span>
				<span className="tabular-nums text-foreground">{format(value)}</span>
			</div>
			<Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
		</div>
	);
}

function ChoiceButton({
	active,
	label,
	onClick,
	children,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			title={label}
			onClick={onClick}
			className={cn(
				"flex h-8 items-center justify-center rounded-md border text-xs transition-colors",
				active
					? "border-[#2563EB] bg-[#2563EB] text-white"
					: "border-foreground/10 bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

/**
 * Icon buttons beside the existing timeline actions. With a layer selected they
 * edit that layer through the same handlers as the settings panel; with nothing
 * selected they trim the clip and every layer under the playhead.
 */
export function LayerContextToolbar({
	availableWidth,
	target,
	selectedAnnotation,
	annotationRegions,
	selectedZoom,
	selectedAudio,
	selectedClipId,
	trimCount,
	onTrim,
	annotationCommands,
	zoomCommands,
	audioCommands,
	onDeleteClip,
}: Props) {
	const imageInputRef = useRef<HTMLInputElement>(null);
	const projectColors = useMemo(() => collectProjectColors(annotationRegions), [annotationRegions]);
	// A text range selected on the canvas: the text controls show and change only that range.
	const textSelection = useTextSelection();
	if (!target) return null;

	const trimItems = (scope: "selected" | "all"): ToolbarItem[] =>
		(["start", "end"] as const).map((edge) => {
			const count = trimCount(edge);
			const verb = edge === "start" ? "Trim start to playhead" : "Trim end to playhead";
			const tooltip =
				scope === "all"
					? count > 0
						? `${verb} (${count} ${count === 1 ? "item" : "items"})`
						: `${verb}: nothing under the playhead`
					: count > 0
						? verb
						: `${verb}: move the playhead inside the layer`;
			return {
				key: `trim-${edge}`,
				kind: "action",
				label: verb,
				tooltip,
				icon: edge === "start" ? <ArrowLineLeft className="h-4 w-4" /> : <ArrowLineRight className="h-4 w-4" />,
				onSelect: () => onTrim(edge),
				disabled: count === 0,
			};
		});

	const deleteItem = (onDelete: () => void): ToolbarItem => ({
		key: "delete",
		kind: "action",
		label: "Delete",
		tooltip: "Delete (Del)",
		icon: <Trash className="h-4 w-4" />,
		onSelect: onDelete,
	});

	const items: ToolbarItem[] = [];
	if (target === "all") {
		items.push(...trimItems("all"));
	} else if (selectedAnnotation) {
		const a = selectedAnnotation;
		const id = a.id;
		const setStyle = (style: Partial<AnnotationRegion["style"]>) =>
			annotationCommands.handleAnnotationStyleChange(id, style);
		if (a.type === "text") {
			// Text keys go to the selected range (or the whole layer); values shown are the range's.
			const setText = (patch: TextStylePatch) => annotationCommands.handleAnnotationTextStyleApply(id, patch);
			const range = textSelection?.annotationId === id ? textSelection : null;
			const runs = runsOf(a);
			const summary = styleSummary(runs, a.style, range?.start ?? 0, range?.end ?? plainTextOf(runs).length);
			const isBold = summary.fontWeight === "bold";
			const isItalic = summary.fontStyle === "italic";
			const isUnderline = summary.textDecoration === "underline";
			const fontSize = summary.fontSize === MIXED ? null : summary.fontSize;
			const textColor = summary.color === MIXED ? null : summary.color;
			items.push(
				{
					key: "text-style",
					kind: "popover",
					label: range ? "Text style (selected text)" : "Text style",
					icon: <TextAa className="h-4 w-4" />,
					popover: (
						<div className="space-y-3">
							<label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
								Size
								<select
									value={fontSize ?? ""}
									onChange={(event) => setText({ fontSize: Number(event.target.value) })}
									className="h-8 rounded-md border border-foreground/10 bg-foreground/5 px-2 text-xs text-foreground"
								>
									{fontSize === null ? (
										<option value="" disabled>
											Mixed
										</option>
									) : null}
									{fontSizeOptions(fontSize ?? a.style.fontSize).map((size) => (
										<option key={size} value={size}>
											{size}px
										</option>
									))}
								</select>
							</label>
							<div className="grid grid-cols-3 gap-1.5">
								<ChoiceButton
									label="Bold"
									active={isBold}
									onClick={() => setText({ fontWeight: isBold ? "normal" : "bold" })}
								>
									<TextB className="h-4 w-4" />
								</ChoiceButton>
								<ChoiceButton
									label="Italic"
									active={isItalic}
									onClick={() => setText({ fontStyle: isItalic ? "normal" : "italic" })}
								>
									<TextItalic className="h-4 w-4" />
								</ChoiceButton>
								<ChoiceButton
									label="Underline"
									active={isUnderline}
									onClick={() => setText({ textDecoration: isUnderline ? "none" : "underline" })}
								>
									<TextUnderline className="h-4 w-4" />
								</ChoiceButton>
							</div>
							<div className="grid grid-cols-3 gap-1.5">
								{(
									[
										["left", "Align left", <TextAlignLeft key="l" className="h-4 w-4" />],
										["center", "Align centre", <TextAlignCenter key="c" className="h-4 w-4" />],
										["right", "Align right", <TextAlignRight key="r" className="h-4 w-4" />],
									] as const
								).map(([align, label, icon]) => (
									<ChoiceButton
										key={align}
										label={label}
										active={a.style.textAlign === align}
										onClick={() => setStyle({ textAlign: align })}
									>
										{icon}
									</ChoiceButton>
								))}
							</div>
						</div>
					),
				},
				{
					key: "text-color",
					kind: "popover",
					label: range ? "Text colour (selected text)" : "Text colour",
					icon: <Palette className="h-4 w-4" />,
					popover: (
						<ColorSwatches
							id={id}
							projectColors={projectColors}
							// Mixed colours: no current value, so any swatch applies.
							color={textColor ?? ""}
							onChange={(hex) => setText({ color: hex })}
							toPatch={(hex) => ({ style: { color: hex } })}
						/>
					),
				},
				{
					key: "text-highlight",
					kind: "popover",
					label: range ? "Highlight (selected text)" : "Highlight",
					icon: <Highlighter className="h-4 w-4" />,
					popover: (
						<ColorSwatches
							id={id}
							projectColors={projectColors}
							onClear={() => setText({ highlight: undefined })}
							clearLabel="No highlight"
							color={summary.highlight === MIXED || !summary.highlight ? "" : summary.highlight}
							onChange={(hex) => setText({ highlight: hex })}
							toPatch={(hex) => ({ textStyle: { highlight: hex } })}
						/>
					),
				},
				{
					key: "text-background",
					kind: "popover",
					label: "Background colour",
					icon: <PaintBucket className="h-4 w-4" />,
					popover: (
						<div className="space-y-2">
							<ColorSwatches
								id={id}
								projectColors={projectColors}
								onClear={() => setStyle({ backgroundColor: "transparent" })}
								clearLabel="No background"
								color={a.style.backgroundColor === "transparent" ? "#000000" : a.style.backgroundColor}
								onChange={(hex) => setStyle({ backgroundColor: hex })}
								toPatch={(hex) => ({ style: { backgroundColor: hex } })}
							/>
						</div>
					),
				},
			);
		} else if (a.type === "image") {
			const hasImage = Boolean(a.content?.startsWith("data:image"));
			items.push({
				key: "image-replace",
				kind: "action",
				label: hasImage ? "Replace image" : "Upload image",
				icon: <ImageSquare className="h-4 w-4" />,
				onSelect: () => imageInputRef.current?.click(),
			});
			if (hasImage) {
				items.push({
					key: "image-remove",
					kind: "action",
					label: "Remove image",
					icon: <XCircle className="h-4 w-4" />,
					onSelect: () => annotationCommands.handleAnnotationContentChange(id, "", null),
				});
			}
		} else if (a.type === "shape") {
			const shape = a.shapeData ?? DEFAULT_SHAPE_DATA;
			const setShape = (patch: Partial<typeof shape>) =>
				annotationCommands.handleAnnotationShapeDataChange(id, patch);
			items.push(
				{
					key: "shape-type",
					kind: "popover",
					label: "Shape",
					icon: shape.kind === "ellipse" ? <Circle className="h-4 w-4" /> : <Rectangle className="h-4 w-4" />,
					popover: (
						<div className="grid grid-cols-2 gap-1.5">
							<ChoiceButton label="Rectangle" active={shape.kind === "rectangle"} onClick={() => setShape({ kind: "rectangle" })}>
								<Rectangle className="h-4 w-4" />
							</ChoiceButton>
							<ChoiceButton label="Ellipse" active={shape.kind === "ellipse"} onClick={() => setShape({ kind: "ellipse" })}>
								<Circle className="h-4 w-4" />
							</ChoiceButton>
						</div>
					),
				},
				{
					key: "shape-fill",
					kind: "popover",
					label: "Fill colour",
					icon: <PaintBucket className="h-4 w-4" />,
					popover: (
						<ColorSwatches
							id={id}
							projectColors={projectColors}
							color={shape.fillColor}
							onChange={(hex) => setShape({ fillColor: hex })}
							toPatch={(hex) => ({ shapeData: { fillColor: hex } })}
						/>
					),
				},
				{
					key: "shape-border",
					kind: "popover",
					label: "Border and corners",
					icon: <BoundingBox className="h-4 w-4" />,
					popover: (
						<div className="space-y-3">
							<ColorSwatches
								id={id}
								projectColors={projectColors}
								color={shape.strokeColor}
								onChange={(hex) => setShape({ strokeColor: hex })}
								toPatch={(hex) => ({ shapeData: { strokeColor: hex } })}
							/>
							<RangeRow
								label="Border width"
								value={shape.strokeWidth}
								min={0}
								max={24}
								format={(v) => `${v}px`}
								onChange={(v) => setShape({ strokeWidth: v })}
							/>
							{shape.kind === "rectangle" ? (
								<RangeRow
									label="Corner radius"
									value={shape.cornerRadius}
									min={0}
									max={120}
									format={(v) => `${v}px`}
									onChange={(v) => setShape({ cornerRadius: v })}
								/>
							) : null}
						</div>
					),
				},
			);
		} else if (a.type === "figure") {
			const figure = a.figureData ?? DEFAULT_FIGURE_DATA;
			const setFigure = (patch: Partial<typeof figure>) =>
				annotationCommands.handleAnnotationFigureDataChange(id, { ...figure, ...patch });
			items.push(
				{
					key: "arrow-direction",
					kind: "popover",
					label: "Arrow direction",
					icon: <ArrowUpRight className="h-4 w-4" />,
					popover: (
						<div className="grid grid-cols-4 gap-1.5">
							{ARROW_DIRECTIONS.map((direction) => {
								const Arrow = getArrowComponent(direction);
								const active = figure.arrowDirection === direction;
								return (
									<ChoiceButton
										key={direction}
										label={`Arrow ${direction.replace(/-/g, " ")}`}
										active={active}
										onClick={() => setFigure({ arrowDirection: direction })}
									>
										<span className="h-5 w-5">
											<Arrow color={active ? "#ffffff" : "#94a3b8"} strokeWidth={3} />
										</span>
									</ChoiceButton>
								);
							})}
						</div>
					),
				},
				{
					key: "arrow-stroke",
					kind: "popover",
					label: "Stroke width",
					icon: <LineSegment className="h-4 w-4" />,
					popover: (
						<RangeRow
							label="Stroke width"
							value={figure.strokeWidth}
							min={1}
							max={20}
							format={(v) => `${v}px`}
							onChange={(v) => setFigure({ strokeWidth: v })}
						/>
					),
				},
				{
					key: "arrow-color",
					kind: "popover",
					label: "Arrow colour",
					icon: <Palette className="h-4 w-4" />,
					popover: (
						<ColorSwatches
							id={id}
							projectColors={projectColors}
							color={figure.color}
							onChange={(hex) => setFigure({ color: hex })}
							toPatch={(hex) => ({ figureData: { color: hex } })}
						/>
					),
				},
			);
		} else if (a.type === "blur") {
			items.push(
				{
					key: "blur-strength",
					kind: "popover",
					label: "Blur strength",
					icon: <Drop className="h-4 w-4" />,
					popover: (
						<RangeRow
							label="Strength"
							value={a.blurIntensity ?? BLUR_ANNOTATION_STRENGTH}
							min={1}
							max={100}
							onChange={(v) => annotationCommands.handleAnnotationBlurIntensityChange(id, v)}
						/>
					),
				},
				{
					key: "blur-color",
					kind: "popover",
					label: "Blur colour",
					icon: <Palette className="h-4 w-4" />,
					popover: (
						<div className="space-y-2">
							<ColorSwatches
								id={id}
								projectColors={projectColors}
								onClear={() => annotationCommands.handleAnnotationBlurColorChange(id, "")}
								clearLabel="Blur only (no colour)"
								color={a.blurColor || "#000000"}
								onChange={(hex) => annotationCommands.handleAnnotationBlurColorChange(id, hex)}
								toPatch={(hex) => ({ blurColor: hex })}
							/>
						</div>
					),
				},
			);
		}
		items.push(...trimItems("selected"), deleteItem(() => annotationCommands.handleAnnotationDelete(id)));
	} else if (selectedZoom) {
		const zoom = selectedZoom;
		const isManual = zoom.mode === "manual";
		items.push(
			{
				key: "zoom-depth",
				kind: "popover",
				label: "Zoom depth",
				icon: <MagnifyingGlassPlus className="h-4 w-4" />,
				popover: (
					<div className="grid grid-cols-3 gap-1.5">
						{ZOOM_DEPTH_OPTIONS.map((option) => (
							<ChoiceButton
								key={option.depth}
								label={`Depth ${option.label}`}
								active={zoom.depth === option.depth}
								onClick={() => zoomCommands.handleZoomDepthChange(option.depth)}
							>
								{option.label}
							</ChoiceButton>
						))}
					</div>
				),
			},
			{
				key: "zoom-mode",
				kind: "action",
				label: isManual ? "Zoom mode: Manual (switch to Auto)" : "Zoom mode: Auto (switch to Manual)",
				icon: <Crosshair className={cn("h-4 w-4", isManual && "text-[#2563EB]")} />,
				onSelect: () => zoomCommands.handleZoomModeChange(isManual ? "auto" : "manual"),
			},
			...trimItems("selected"),
			deleteItem(() => zoomCommands.handleZoomDelete(zoom.id)),
		);
	} else if (selectedAudio) {
		const audio = selectedAudio;
		items.push(
			{
				key: "audio-volume",
				kind: "popover",
				label: "Volume and normalize",
				icon: <SpeakerHigh className="h-4 w-4" />,
				popover: (
					<div className="space-y-3">
						<RangeRow
							label="Volume"
							value={audio.volume}
							min={0}
							max={1}
							step={0.01}
							format={(v) => `${Math.round(v * 100)}%`}
							onChange={(v) => audioCommands.handleAudioVolumeChange(v)}
						/>
						<label className="flex items-center justify-between text-xs text-muted-foreground">
							Normalize
							<Switch
								checked={Boolean(audio.normalize)}
								onCheckedChange={(v) => audioCommands.handleAudioNormalizeChange(v)}
								className="scale-75 data-[state=checked]:bg-[#2563EB]"
							/>
						</label>
					</div>
				),
			},
			...trimItems("selected"),
			deleteItem(() => audioCommands.handleAudioDelete(audio.id)),
		);
	} else if (selectedClipId) {
		const clipId = selectedClipId;
		items.push(...trimItems("selected"), deleteItem(() => onDeleteClip(clipId)));
	}

	const fit = fitToolbarItems(items, availableWidth);
	if (fit.visible.length === 0 && fit.overflow.length === 0) return null;

	const renderItem = (item: ToolbarItem) => {
		if (item.kind === "popover") {
			return (
				<Popover key={item.key}>
					{/* PopoverTrigger does not forward refs, so the tooltip uses its wrapper span. */}
					<Tooltip content={item.tooltip ?? item.label}>
						<PopoverTrigger asChild>
							<Button variant="ghost" size="icon" className={BUTTON_CLASS} aria-label={item.label}>
								{item.icon}
							</Button>
						</PopoverTrigger>
					</Tooltip>
					<PopoverContent
						side="top"
						align="center"
						collisionPadding={12}
						avoidCollisions
						sticky="always"
						className={POPOVER_CLASS}
					>
						{item.popover}
					</PopoverContent>
				</Popover>
			);
		}
		const button = (
			<Button
				variant="ghost"
				size="icon"
				className={cn(BUTTON_CLASS, item.disabled && "pointer-events-none opacity-40")}
				aria-label={item.label}
				disabled={item.disabled}
				onClick={item.onSelect}
			>
				{item.icon}
			</Button>
		);
		// Disabled buttons get no pointer events, so the tooltip hangs off a wrapper.
		return item.disabled ? (
			<Tooltip key={item.key} content={item.tooltip ?? item.label}>
				{button}
			</Tooltip>
		) : (
			<Tooltip key={item.key} content={item.tooltip ?? item.label} asChild>
				{button}
			</Tooltip>
		);
	};

	return (
		<div className="flex flex-shrink-0 items-center gap-1.5" data-testid="layer-context-toolbar">
			<div className="mx-1 h-4 w-px bg-foreground/10" />
			{fit.visible.map(renderItem)}
			{fit.overflow.length > 0 ? (
				<DropdownMenu>
					<Tooltip content="More" asChild>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className={BUTTON_CLASS} aria-label="More">
								<DotsThree className="h-4 w-4" weight="bold" />
							</Button>
						</DropdownMenuTrigger>
					</Tooltip>
					<DropdownMenuContent align="start" className="border-foreground/10 bg-editor-surface-alt">
						{fit.overflow.map((item) => (
							<DropdownMenuItem
								key={item.key}
								disabled={item.disabled}
								onClick={item.onSelect}
								className="flex cursor-pointer items-center gap-2 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								{item.icon}
								{item.tooltip ?? item.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			{selectedAnnotation?.type === "image" ? (
				<input
					ref={imageInputRef}
					type="file"
					accept=".jpg,.jpeg,.png,.gif,.webp,image/*"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (!file || !IMAGE_TYPES.includes(file.type)) return;
						const reader = new FileReader();
						reader.onload = () => {
							const dataUrl = reader.result;
							if (typeof dataUrl !== "string") return;
							// The box keeps its width and takes the new image's height.
							void loadImageSize(dataUrl).then((naturalSize) =>
								annotationCommands.handleAnnotationContentChange(
									selectedAnnotation.id,
									dataUrl,
									file.name,
									naturalSize,
								),
							);
						};
						reader.readAsDataURL(file);
					}}
				/>
			) : null}
		</div>
	);
}
