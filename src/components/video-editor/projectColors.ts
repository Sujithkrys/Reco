import { normalizeHex } from "@/lib/colorUtils";
import type { AnnotationRegion } from "./types";

/** Colours already used by the project's layers, most recently listed layer first, without duplicates. */
export function collectProjectColors(regions: AnnotationRegion[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	const add = (value: unknown) => {
		if (typeof value !== "string") return;
		const hex = normalizeHex(value);
		if (!hex || seen.has(hex)) return;
		seen.add(hex);
		out.push(hex);
	};
	for (let i = regions.length - 1; i >= 0; i--) {
		const region = regions[i];
		add(region.style?.color);
		add(region.style?.backgroundColor);
		add(region.shapeData?.fillColor);
		add(region.shapeData?.strokeColor);
		add(region.figureData?.color);
		add(region.blurColor);
	}
	return out;
}
