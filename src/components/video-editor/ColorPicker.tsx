import { Circle, CircleNotch } from "@phosphor-icons/react";
import {
	type KeyboardEvent,
	type PointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	clamp,
	type Hsva,
	hexToHsva,
	hslToRgb,
	hsvaToHex,
	hsvToRgb,
	normalizeHex,
	parseChannel,
	parseHex,
	type Rgba,
	rgbToHsl,
	rgbToHsv,
} from "@/lib/colorUtils";
import { addRecentColor, getRecentColors } from "@/lib/recentColors";
import { cn } from "@/lib/utils";
import { useScopedT } from "../../contexts/I18nContext";
import { ColorEyedropperButton } from "./ColorEyedropperButton";

const CHECKERBOARD =
	"repeating-conic-gradient(rgba(128,128,128,0.35) 0% 25%, transparent 0% 50%) 50% / 8px 8px";
const HUE_GRADIENT =
	"linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)";
const HUE_RING_GRADIENT =
	"conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
const RING_SIZE = 104;
const RING_THICKNESS = 14;
const FALLBACK: Hsva = { h: 0, s: 0, v: 0, a: 1 };

type TFn = (key: string, fallback?: string) => string;

/** Pointer-capture drag over a surface: reports 0-1 coordinates, and whether it ended by release or cancel. */
function useDragSurface(
	onDrag: (x: number, y: number) => void,
	onEnd: (cancelled: boolean) => void,
) {
	const dragging = useRef(false);
	const report = (event: PointerEvent<HTMLElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;
		onDrag(
			clamp((event.clientX - rect.left) / rect.width, 0, 1),
			clamp((event.clientY - rect.top) / rect.height, 0, 1),
		);
	};
	return {
		onPointerDown: (event: PointerEvent<HTMLElement>) => {
			if (event.button !== 0) return;
			event.preventDefault();
			event.currentTarget.setPointerCapture?.(event.pointerId);
			event.currentTarget.focus();
			dragging.current = true;
			report(event);
		},
		onPointerMove: (event: PointerEvent<HTMLElement>) => {
			if (dragging.current) report(event);
		},
		onPointerUp: (event: PointerEvent<HTMLElement>) => {
			if (!dragging.current) return;
			dragging.current = false;
			event.currentTarget.releasePointerCapture?.(event.pointerId);
			onEnd(false);
		},
		onPointerCancel: () => {
			if (!dragging.current) return;
			dragging.current = false;
			onEnd(true);
		},
	};
}

function NumberField({
	label,
	value,
	min,
	max,
	onCommit,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	onCommit: (value: number, stepped: boolean) => void;
}) {
	const [text, setText] = useState(String(Math.round(value)));
	const [focused, setFocused] = useState(false);
	useEffect(() => {
		if (!focused) setText(String(Math.round(value)));
	}, [value, focused]);

	const commit = (raw: string) => {
		const parsed = parseChannel(raw, min, max);
		if (parsed === null) {
			setText(String(Math.round(value)));
			return;
		}
		setText(String(parsed));
		if (parsed !== Math.round(value)) onCommit(parsed, false);
	};
	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			commit(text);
			return;
		}
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
		event.preventDefault();
		const current = parseChannel(text, min, max) ?? Math.round(value);
		const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
		const next = Math.round(clamp(current + step, min, max));
		setText(String(next));
		if (next !== Math.round(value)) onCommit(next, true);
	};
	return (
		<input
			type="text"
			inputMode="numeric"
			aria-label={label}
			title={label}
			value={text}
			onFocus={(event) => {
				setFocused(true);
				event.currentTarget.select();
			}}
			onBlur={() => {
				setFocused(false);
				commit(text);
			}}
			onChange={(event) => setText(event.target.value)}
			onKeyDown={onKeyDown}
			className="h-7 w-full min-w-0 rounded-md border border-foreground/10 bg-foreground/5 px-1 text-center text-xs tabular-nums text-foreground outline-none focus:border-[#2563EB]"
		/>
	);
}

function Swatch({
	color,
	active,
	onPick,
	onPreview,
}: {
	color: string;
	active: boolean;
	onPick: (hex: string) => void;
	onPreview?: (hex: string | null) => void;
}) {
	return (
		<button
			type="button"
			title={color}
			aria-label={color}
			onClick={() => onPick(color)}
			onMouseEnter={() => onPreview?.(color)}
			onMouseLeave={() => onPreview?.(null)}
			onFocus={() => onPreview?.(color)}
			onBlur={() => onPreview?.(null)}
			className={cn(
				"h-5 w-5 rounded-md border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
				active ? "border-foreground ring-1 ring-[#2563EB]" : "border-foreground/20",
			)}
			style={{ backgroundColor: color }}
		/>
	);
}

function SwatchRow({
	title,
	colors,
	value,
	onPick,
	onPreview,
}: {
	title: string;
	colors: string[];
	value: string;
	onPick: (hex: string) => void;
	onPreview?: (hex: string | null) => void;
}) {
	if (colors.length === 0) return null;
	return (
		<div className="space-y-1.5">
			<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				{title}
			</div>
			<div className="flex flex-wrap gap-1.5">
				{colors.map((color) => (
					<Swatch
						key={color}
						color={color}
						active={color.toLowerCase() === value}
						onPick={onPick}
						onPreview={onPreview}
					/>
				))}
			</div>
		</div>
	);
}

export interface ColorPickerProps {
	/** Current colour as a hex string; anything else (for example "transparent") shows as black. */
	value: string;
	/** Applies a colour for real. Called once per user gesture (one drag, one swatch click, one typed value). */
	onChange: (hex: string) => void;
	/** Live value while hovering a swatch or dragging, null to revert. Never applied to the project. */
	onPreview?: (hex: string | null) => void;
	presets: string[];
	/** Colours already used by this project's layers. */
	projectColors?: string[];
	/** Only for fields whose stored value can carry alpha; the opacity bar and 8-digit hex are hidden otherwise. */
	allowAlpha?: boolean;
	/** Offers a "no fill" option for fields that allow it. */
	onClear?: () => void;
	clearLabel?: string;
	className?: string;
}

export function ColorPicker({
	value,
	onChange,
	onPreview,
	presets,
	projectColors = [],
	allowAlpha = false,
	onClear,
	clearLabel,
	className,
}: ColorPickerProps) {
	const t = useScopedT("editor") as TFn;
	const normalizedValue = normalizeHex(value, allowAlpha) ?? "";
	const [hsva, setHsva] = useState<Hsva>(() => hexToHsva(value) ?? FALLBACK);
	const liveRef = useRef(hsva);
	const [ring, setRing] = useState(false);
	const [channelMode, setChannelMode] = useState<"rgb" | "hsl">("rgb");
	const [recent, setRecent] = useState<string[]>(() => getRecentColors());
	const [hexText, setHexText] = useState(() =>
		hsvaToHex(hexToHsva(value) ?? FALLBACK, allowAlpha).replace(/^#/, ""),
	);
	const [hexFocused, setHexFocused] = useState(false);

	const currentHex = hsvaToHex(hsva, allowAlpha);

	// Follow outside changes (undo, the toolbar, the eyedropper) but keep the hue when the colour is grey.
	useEffect(() => {
		const parsed = hexToHsva(value);
		if (!parsed) return;
		setHsva((previous) => {
			if (hsvaToHex(previous, allowAlpha) === normalizedValue) return previous;
			const next = parsed.s === 0 || parsed.v === 0 ? { ...parsed, h: previous.h } : parsed;
			liveRef.current = next;
			return next;
		});
	}, [value, normalizedValue, allowAlpha]);

	useEffect(() => {
		if (!hexFocused) setHexText(currentHex.replace(/^#/, ""));
	}, [currentHex, hexFocused]);

	const commit = useCallback(
		(next: Hsva, remember = true) => {
			const hex = hsvaToHex(next, allowAlpha);
			liveRef.current = next;
			setHsva(next);
			onPreview?.(null);
			// Arrow-key stepping would flood the recent list, so only deliberate picks are remembered.
			if (remember) setRecent(addRecentColor(hex));
			if (hex !== normalizedValue) onChange(hex);
		},
		[allowAlpha, normalizedValue, onChange, onPreview],
	);

	const live = useCallback(
		(next: Hsva) => {
			liveRef.current = next;
			setHsva(next);
			onPreview?.(hsvaToHex(next, allowAlpha));
		},
		[allowAlpha, onPreview],
	);

	const endDrag = useCallback(
		(cancelled: boolean) => {
			if (cancelled) {
				onPreview?.(null);
				const restored = hexToHsva(value) ?? FALLBACK;
				liveRef.current = restored;
				setHsva(restored);
				return;
			}
			commit(liveRef.current);
		},
		[commit, onPreview, value],
	);

	const withRgba = useCallback(
		(rgba: Rgba) => {
			const next = rgbToHsv(rgba);
			return next.s === 0 || next.v === 0 ? { ...next, h: hsva.h } : next;
		},
		[hsva.h],
	);

	const svDrag = useDragSurface(
		(x, y) => live({ ...liveRef.current, s: x * 100, v: (1 - y) * 100 }),
		endDrag,
	);
	const hueDrag = useDragSurface((x) => live({ ...liveRef.current, h: x * 360 }), endDrag);
	const ringDrag = useDragSurface((x, y) => {
		const angle = (Math.atan2(x - 0.5, -(y - 0.5)) * 180) / Math.PI;
		live({ ...liveRef.current, h: (angle + 360) % 360 });
	}, endDrag);
	const alphaDrag = useDragSurface((x) => live({ ...liveRef.current, a: x }), endDrag);

	const onSvKey = (event: KeyboardEvent<HTMLElement>) => {
		const step = event.shiftKey ? 10 : 1;
		let { s, v } = hsva;
		if (event.key === "ArrowLeft") s -= step;
		else if (event.key === "ArrowRight") s += step;
		else if (event.key === "ArrowUp") v += step;
		else if (event.key === "ArrowDown") v -= step;
		else return;
		event.preventDefault();
		commit({ ...hsva, s: clamp(s, 0, 100), v: clamp(v, 0, 100) }, false);
	};
	const onHueKey = (event: KeyboardEvent<HTMLElement>) => {
		const step = event.shiftKey ? 10 : 1;
		let h = hsva.h;
		if (event.key === "ArrowLeft" || event.key === "ArrowDown") h -= step;
		else if (event.key === "ArrowRight" || event.key === "ArrowUp") h += step;
		else if (event.key === "Home") h = 0;
		else if (event.key === "End") h = 359;
		else return;
		event.preventDefault();
		commit({ ...hsva, h: ((h % 360) + 360) % 360 }, false);
	};
	const onAlphaKey = (event: KeyboardEvent<HTMLElement>) => {
		const step = event.shiftKey ? 0.1 : 0.01;
		let a = hsva.a;
		if (event.key === "ArrowLeft" || event.key === "ArrowDown") a -= step;
		else if (event.key === "ArrowRight" || event.key === "ArrowUp") a += step;
		else return;
		event.preventDefault();
		commit({ ...hsva, a: clamp(a, 0, 1) }, false);
	};

	const commitHexText = (raw: string) => {
		const parsed = parseHex(raw);
		if (!parsed) {
			setHexText(currentHex.replace(/^#/, ""));
			return;
		}
		const next = withRgba(allowAlpha ? parsed : { ...parsed, a: 1 });
		setHexText(hsvaToHex(next, allowAlpha).replace(/^#/, ""));
		commit(next);
	};

	const rgb = useMemo(() => hsvToRgb(hsva), [hsva]);
	const hsl = useMemo(() => rgbToHsl(rgb), [rgb]);
	const pureHue = hsvaToHex({ h: hsva.h, s: 100, v: 100, a: 1 });
	const opaqueHex = hsvaToHex({ ...hsva, a: 1 });

	const allProject = useMemo(() => {
		const seen = new Set(presets.map((color) => color.toLowerCase()));
		const out: string[] = [];
		for (const color of projectColors) {
			const hex = normalizeHex(color);
			if (!hex || seen.has(hex)) continue;
			seen.add(hex);
			out.push(hex);
			if (out.length >= 12) break;
		}
		return out;
	}, [presets, projectColors]);

	const ringRadius = RING_SIZE / 2 - RING_THICKNESS / 2;
	const ringAngle = (hsva.h * Math.PI) / 180;

	return (
		<div className={cn("w-full space-y-3 text-foreground", className)}>
			{/* Saturation / brightness */}
			<div
				role="slider"
				tabIndex={0}
				aria-label={t("colorPicker.saturationValue", "Saturation and brightness")}
				aria-valuetext={`${Math.round(hsva.s)}%, ${Math.round(hsva.v)}%`}
				aria-valuenow={Math.round(hsva.s)}
				aria-valuemin={0}
				aria-valuemax={100}
				onKeyDown={onSvKey}
				{...svDrag}
				className="relative h-[140px] w-full cursor-crosshair touch-none select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
				style={{
					backgroundColor: pureHue,
					backgroundImage:
						"linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))",
				}}
			>
				<span
					className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
					style={{
						left: `${hsva.s}%`,
						top: `${100 - hsva.v}%`,
						backgroundColor: opaqueHex,
					}}
				/>
			</div>

			{/* Hue: bar or ring */}
			<div className="flex items-center gap-2">
				{ring ? (
					<div className="flex flex-1 justify-center">
						<div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
							<div
								role="slider"
								tabIndex={0}
								aria-label={t("colorPicker.hue", "Hue")}
								aria-valuemin={0}
								aria-valuemax={360}
								aria-valuenow={Math.round(hsva.h)}
								onKeyDown={onHueKey}
								{...ringDrag}
								className="absolute inset-0 cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
								style={{
									background: HUE_RING_GRADIENT,
									WebkitMask: `radial-gradient(circle, transparent ${RING_SIZE / 2 - RING_THICKNESS}px, #000 ${RING_SIZE / 2 - RING_THICKNESS + 1}px)`,
									mask: `radial-gradient(circle, transparent ${RING_SIZE / 2 - RING_THICKNESS}px, #000 ${RING_SIZE / 2 - RING_THICKNESS + 1}px)`,
								}}
							/>
							<span
								className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
								style={{
									backgroundColor: pureHue,
									left: RING_SIZE / 2 + Math.sin(ringAngle) * ringRadius,
									top: RING_SIZE / 2 - Math.cos(ringAngle) * ringRadius,
								}}
							/>
						</div>
					</div>
				) : (
					<div
						role="slider"
						tabIndex={0}
						aria-label={t("colorPicker.hue", "Hue")}
						aria-valuemin={0}
						aria-valuemax={360}
						aria-valuenow={Math.round(hsva.h)}
						onKeyDown={onHueKey}
						{...hueDrag}
						className="relative h-3 flex-1 cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
						style={{ background: HUE_GRADIENT }}
					>
						<span
							className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
							style={{ left: `${(hsva.h / 360) * 100}%`, backgroundColor: pureHue }}
						/>
					</div>
				)}
				<button
					type="button"
					onClick={() => setRing((current) => !current)}
					aria-pressed={ring}
					title={
						ring
							? t("colorPicker.barMode", "Switch to hue bar")
							: t("colorPicker.ringMode", "Switch to hue ring")
					}
					aria-label={
						ring
							? t("colorPicker.barMode", "Switch to hue bar")
							: t("colorPicker.ringMode", "Switch to hue ring")
					}
					className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-foreground/10 bg-foreground/5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
				>
					{ring ? <Circle className="h-4 w-4" /> : <CircleNotch className="h-4 w-4" />}
				</button>
			</div>

			{/* Opacity: only for fields that can store alpha */}
			{allowAlpha ? (
				<div
					role="slider"
					tabIndex={0}
					aria-label={t("colorPicker.opacity", "Opacity")}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(hsva.a * 100)}
					onKeyDown={onAlphaKey}
					{...alphaDrag}
					className="relative h-3 w-full cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
					style={{ background: CHECKERBOARD }}
				>
					<div
						className="absolute inset-0 rounded-full"
						style={{ background: `linear-gradient(to right, transparent, ${opaqueHex})` }}
					/>
					<span
						className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
						style={{ left: `${hsva.a * 100}%`, backgroundColor: opaqueHex }}
					/>
				</div>
			) : null}

			{/* Inputs */}
			<div className="flex items-center gap-1.5">
				<div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-foreground/10 bg-foreground/5 px-2 focus-within:border-[#2563EB]">
					<span className="mr-1 text-xs text-muted-foreground">#</span>
					<input
						type="text"
						aria-label={t("colorPicker.hex", "Hex colour")}
						spellCheck={false}
						maxLength={9}
						value={hexText}
						onFocus={(event) => {
							setHexFocused(true);
							event.currentTarget.select();
						}}
						onBlur={() => {
							setHexFocused(false);
							commitHexText(hexText);
						}}
						onChange={(event) => setHexText(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") commitHexText(hexText);
						}}
						className="w-full min-w-0 bg-transparent text-xs uppercase tabular-nums text-foreground outline-none"
					/>
				</div>
				<ColorEyedropperButton onPick={(hex) => commitHexText(hex)} />
			</div>
			<div className="flex items-center gap-1.5">
				{channelMode === "rgb" ? (
					<>
						<NumberField
							label={t("colorPicker.red", "Red")}
							value={rgb.r}
							min={0}
							max={255}
							onCommit={(r, stepped) => commit(withRgba({ ...rgb, r }), !stepped)}
						/>
						<NumberField
							label={t("colorPicker.green", "Green")}
							value={rgb.g}
							min={0}
							max={255}
							onCommit={(g, stepped) => commit(withRgba({ ...rgb, g }), !stepped)}
						/>
						<NumberField
							label={t("colorPicker.blue", "Blue")}
							value={rgb.b}
							min={0}
							max={255}
							onCommit={(b, stepped) => commit(withRgba({ ...rgb, b }), !stepped)}
						/>
					</>
				) : (
					<>
						<NumberField
							label={t("colorPicker.hue", "Hue")}
							value={hsl.h}
							min={0}
							max={360}
							onCommit={(h, stepped) => commit(withRgba(hslToRgb({ ...hsl, h })), !stepped)}
						/>
						<NumberField
							label={t("colorPicker.saturation", "Saturation")}
							value={hsl.s}
							min={0}
							max={100}
							onCommit={(s, stepped) => commit(withRgba(hslToRgb({ ...hsl, s })), !stepped)}
						/>
						<NumberField
							label={t("colorPicker.lightness", "Lightness")}
							value={hsl.l}
							min={0}
							max={100}
							onCommit={(l, stepped) => commit(withRgba(hslToRgb({ ...hsl, l })), !stepped)}
						/>
					</>
				)}
				{allowAlpha ? (
					<NumberField
						label={t("colorPicker.opacity", "Opacity")}
						value={hsva.a * 100}
						min={0}
						max={100}
						onCommit={(a, stepped) => commit({ ...hsva, a: a / 100 }, !stepped)}
					/>
				) : null}
				<button
					type="button"
					onClick={() => setChannelMode((mode) => (mode === "rgb" ? "hsl" : "rgb"))}
					title={t("colorPicker.channelMode", "Switch between RGB and HSL")}
					aria-label={t("colorPicker.channelMode", "Switch between RGB and HSL")}
					className="h-7 w-10 flex-shrink-0 rounded-md border border-foreground/10 bg-foreground/5 text-[10px] font-semibold uppercase text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
				>
					{channelMode}
				</button>
			</div>

			{/* Swatches */}
			<SwatchRow
				title={t("colorPicker.presets", "Presets")}
				colors={presets}
				value={normalizedValue}
				onPick={(hex) => commit(withRgba(parseHex(hex) ?? rgb))}
				onPreview={onPreview}
			/>
			<SwatchRow
				title={t("colorPicker.recent", "Recent")}
				colors={recent}
				value={normalizedValue}
				onPick={(hex) => commit(withRgba(parseHex(hex) ?? rgb))}
				onPreview={onPreview}
			/>
			<SwatchRow
				title={t("colorPicker.inProject", "In this project")}
				colors={allProject}
				value={normalizedValue}
				onPick={(hex) => commit(withRgba(parseHex(hex) ?? rgb))}
				onPreview={onPreview}
			/>

			{onClear ? (
				<button
					type="button"
					onClick={() => {
						onPreview?.(null);
						onClear();
					}}
					className="flex h-7 w-full items-center justify-center gap-2 rounded-md border border-foreground/10 bg-foreground/5 text-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
				>
					<span
						className="h-3.5 w-3.5 rounded-sm border border-foreground/20"
						style={{ background: CHECKERBOARD }}
					/>
					{clearLabel ?? t("colorPicker.none", "None")}
				</button>
			) : null}
		</div>
	);
}
