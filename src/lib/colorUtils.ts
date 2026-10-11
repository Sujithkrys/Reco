export interface Rgba {
	r: number;
	g: number;
	b: number;
	/** 0-1 */
	a: number;
}

export interface Hsva {
	/** 0-360 */
	h: number;
	/** 0-100 */
	s: number;
	/** 0-100 */
	v: number;
	/** 0-1 */
	a: number;
}

export interface Hsla {
	h: number;
	s: number;
	l: number;
	a: number;
}

export function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}

/** Parses #rgb, #rgba, #rrggbb and #rrggbbaa, with or without the #. Returns null for anything else. */
export function parseHex(input: string): Rgba | null {
	if (typeof input !== "string") return null;
	const text = input.trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]+$/.test(text)) return null;
	let full: string;
	if (text.length === 3 || text.length === 4) {
		full = text
			.split("")
			.map((c) => c + c)
			.join("");
	} else if (text.length === 6 || text.length === 8) {
		full = text;
	} else {
		return null;
	}
	const r = Number.parseInt(full.slice(0, 2), 16);
	const g = Number.parseInt(full.slice(2, 4), 16);
	const b = Number.parseInt(full.slice(4, 6), 16);
	const a = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
	return { r, g, b, a };
}

function byteHex(value: number): string {
	return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

/** Lowercase #rrggbb, or #rrggbbaa when `withAlpha` is set and the colour is not fully opaque. */
export function rgbaToHex({ r, g, b, a }: Rgba, withAlpha = false): string {
	const base = `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
	if (withAlpha && a < 1) return `${base}${byteHex(a * 255)}`;
	return base;
}

export function rgbToHsv({ r, g, b, a }: Rgba): Hsva {
	const rn = clamp(r, 0, 255) / 255;
	const gn = clamp(g, 0, 255) / 255;
	const bn = clamp(b, 0, 255) / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const delta = max - min;
	let h = 0;
	if (delta !== 0) {
		if (max === rn) h = ((gn - bn) / delta) % 6;
		else if (max === gn) h = (bn - rn) / delta + 2;
		else h = (rn - gn) / delta + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	const s = max === 0 ? 0 : (delta / max) * 100;
	return { h, s, v: max * 100, a };
}

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
	const hn = ((((h % 360) + 360) % 360) / 60) % 6;
	const sn = clamp(s, 0, 100) / 100;
	const vn = clamp(v, 0, 100) / 100;
	const c = vn * sn;
	const x = c * (1 - Math.abs((hn % 2) - 1));
	const m = vn - c;
	let rgb: [number, number, number];
	if (hn < 1) rgb = [c, x, 0];
	else if (hn < 2) rgb = [x, c, 0];
	else if (hn < 3) rgb = [0, c, x];
	else if (hn < 4) rgb = [0, x, c];
	else if (hn < 5) rgb = [x, 0, c];
	else rgb = [c, 0, x];
	return {
		r: Math.round((rgb[0] + m) * 255),
		g: Math.round((rgb[1] + m) * 255),
		b: Math.round((rgb[2] + m) * 255),
		a,
	};
}

export function rgbToHsl(rgba: Rgba): Hsla {
	const { h, v, s: sv, a } = rgbToHsv(rgba);
	const l = (v / 100) * (1 - sv / 100 / 2);
	const s = l === 0 || l === 1 ? 0 : (v / 100 - l) / Math.min(l, 1 - l);
	return { h, s: s * 100, l: l * 100, a };
}

export function hslToRgb({ h, s, l, a }: Hsla): Rgba {
	const sn = clamp(s, 0, 100) / 100;
	const ln = clamp(l, 0, 100) / 100;
	const v = ln + sn * Math.min(ln, 1 - ln);
	const sv = v === 0 ? 0 : 2 * (1 - ln / v);
	return hsvToRgb({ h, s: sv * 100, v: v * 100, a });
}

export function hexToHsva(hex: string): Hsva | null {
	const rgba = parseHex(hex);
	return rgba ? rgbToHsv(rgba) : null;
}

export function hsvaToHex(hsva: Hsva, withAlpha = false): string {
	return rgbaToHex(hsvToRgb(hsva), withAlpha);
}

/** Normalises a user-entered colour to lowercase #rrggbb(aa), or null if it is not one. */
export function normalizeHex(input: string, withAlpha = false): string | null {
	const rgba = parseHex(input);
	return rgba ? rgbaToHex(rgba, withAlpha) : null;
}

/** Whole-number channel from text: ignores anything that is not a number, clamps to the range. */
export function parseChannel(text: string, min = 0, max = 255): number | null {
	const trimmed = text.trim();
	if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
	return Math.round(clamp(Number(trimmed), min, max));
}

/** Colour under a point of the saturation/brightness square (x, y in 0-1, y down), keeping the current hue and alpha. */
export function svColorAt(hsva: Hsva, x: number, y: number): Hsva {
	return { ...hsva, s: clamp(x, 0, 1) * 100, v: (1 - clamp(y, 0, 1)) * 100 };
}

/** Colour under a point of the hue bar (x in 0-1), keeping saturation, brightness and alpha. */
export function hueBarColorAt(hsva: Hsva, x: number): Hsva {
	return { ...hsva, h: Math.min(359.999, clamp(x, 0, 1) * 360) };
}

/** Hue (0-360, 0 at the top, clockwise) at a point of a square holding a hue ring (x, y in 0-1). */
export function ringHueAt(x: number, y: number): number {
	const angle = (Math.atan2(clamp(x, 0, 1) - 0.5, -(clamp(y, 0, 1) - 0.5)) * 180) / Math.PI;
	return (angle + 360) % 360;
}

/** Colour under a point of the hue ring, keeping saturation, brightness and alpha. */
export function ringColorAt(hsva: Hsva, x: number, y: number): Hsva {
	return { ...hsva, h: ringHueAt(x, y) };
}
