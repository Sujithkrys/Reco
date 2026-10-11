import { describe, expect, it } from "vitest";
import {
	accumulateAdjustment,
	applyAdjustment,
	type LayerKeyInput,
	mapLayerKey,
	NO_ADJUSTMENT,
	reorderedZIndexes,
	SCALE_STEP,
} from "./layerKeyboard";

const base: LayerKeyInput = {
	key: "",
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	editable: false,
	hasSelection: true,
};
const press = (key: string, over: Partial<LayerKeyInput> = {}) => mapLayerKey({ ...base, key, ...over });

describe("mapLayerKey", () => {
	it("moves 0.5 percent per arrow, 5 percent with Shift, about one pixel with Alt", () => {
		expect(press("ArrowLeft")).toEqual({ type: "move", dx: -1, dy: 0, unit: "percent", amount: 0.5 });
		expect(press("ArrowDown", { shiftKey: true })).toEqual({
			type: "move",
			dx: 0,
			dy: 1,
			unit: "percent",
			amount: 5,
		});
		expect(press("ArrowUp", { altKey: true })).toEqual({
			type: "move",
			dx: 0,
			dy: -1,
			unit: "pixel",
			amount: 1,
		});
		// Alt wins over Shift.
		expect(press("ArrowRight", { altKey: true, shiftKey: true })).toMatchObject({ unit: "pixel" });
	});

	it("leaves Ctrl + arrow to the browser and the timeline", () => {
		expect(press("ArrowLeft", { ctrlKey: true })).toBeNull();
		expect(press("ArrowLeft", { metaKey: true })).toBeNull();
	});

	it("maps the Ctrl shortcuts", () => {
		expect(press("d", { ctrlKey: true })).toEqual({ type: "duplicate" });
		expect(press("D", { metaKey: true })).toEqual({ type: "duplicate" });
		expect(press("[", { ctrlKey: true })).toEqual({ type: "order", direction: "down" });
		expect(press("]", { ctrlKey: true })).toEqual({ type: "order", direction: "up" });
		expect(press("=", { ctrlKey: true })).toEqual({ type: "scale", factor: SCALE_STEP });
		expect(press("+", { ctrlKey: true, shiftKey: true })).toEqual({ type: "scale", factor: SCALE_STEP });
		expect(press("-", { ctrlKey: true })).toEqual({ type: "scale", factor: 1 / SCALE_STEP });
	});

	it("Escape deselects, but not with modifiers", () => {
		expect(press("Escape")).toEqual({ type: "deselect" });
		expect(press("Escape", { ctrlKey: true })).toBeNull();
	});

	it("claims nothing without a selection, so browser zoom and scrolling keep working", () => {
		for (const key of ["ArrowLeft", "Escape"]) expect(press(key, { hasSelection: false })).toBeNull();
		for (const key of ["=", "-", "d", "[", "]"]) {
			expect(press(key, { ctrlKey: true, hasSelection: false })).toBeNull();
		}
	});

	it("claims nothing while typing", () => {
		for (const key of ["ArrowLeft", "Escape"]) expect(press(key, { editable: true })).toBeNull();
		expect(press("d", { ctrlKey: true, editable: true })).toBeNull();
	});

	it("ignores plain letters and Delete", () => {
		expect(press("a")).toBeNull();
		expect(press("Delete")).toBeNull();
		expect(press("d")).toBeNull();
	});
});

describe("holding keys", () => {
	const box = { position: { x: 40, y: 30 }, size: { width: 20, height: 10 }, fontSize: 32 };
	const px = { width: 1000, height: 500 };

	it("accumulates moves from the first box, so a held key is one adjustment", () => {
		let adjustment = NO_ADJUSTMENT;
		const right = { type: "move", dx: 1, dy: 0, unit: "percent", amount: 0.5 } as const;
		for (let i = 0; i < 10; i++) adjustment = accumulateAdjustment(adjustment, right, px);
		const result = applyAdjustment(box, adjustment, "image");
		expect(result.position.x).toBeCloseTo(45);
		expect(result.position.y).toBe(30);
		expect(result.size).toEqual(box.size);
	});

	it("turns one pixel into the right percent on each axis", () => {
		const left = accumulateAdjustment(
			NO_ADJUSTMENT,
			{ type: "move", dx: -1, dy: 0, unit: "pixel", amount: 1 },
			px,
		);
		const up = accumulateAdjustment(
			NO_ADJUSTMENT,
			{ type: "move", dx: 0, dy: -1, unit: "pixel", amount: 1 },
			px,
		);
		expect(left.offset.x).toBeCloseTo(-0.1);
		expect(up.offset.y).toBeCloseTo(-0.2);
	});

	it("scales around the centre", () => {
		const grown = applyAdjustment(
			box,
			accumulateAdjustment(NO_ADJUSTMENT, { type: "scale", factor: 1.05 }, px),
			"image",
		);
		expect(grown.size.width).toBeCloseTo(21);
		expect(grown.size.height).toBeCloseTo(10.5);
		expect(grown.position.x + grown.size.width / 2).toBeCloseTo(50);
		expect(grown.position.y + grown.size.height / 2).toBeCloseTo(35);
		expect(grown.fontSize).toBe(32);
	});

	it("scales text font size as a whole number from the original, within 8 to 400", () => {
		const grow = (n: number, from = box) => {
			let adjustment = NO_ADJUSTMENT;
			for (let i = 0; i < n; i++) {
				adjustment = accumulateAdjustment(adjustment, { type: "scale", factor: SCALE_STEP }, px);
			}
			return applyAdjustment(from, adjustment, "text").fontSize;
		};
		expect(grow(1)).toBe(34);
		expect(Number.isInteger(grow(3))).toBe(true);
		expect(grow(200)).toBe(400);
		// Small fonts still make progress: rounding is from the original, not step by step.
		expect(grow(5, { ...box, fontSize: 8 })).toBe(10);
		let shrink = NO_ADJUSTMENT;
		for (let i = 0; i < 200; i++) {
			shrink = accumulateAdjustment(shrink, { type: "scale", factor: 1 / SCALE_STEP }, px);
		}
		expect(applyAdjustment(box, shrink, "text").fontSize).toBe(8);
	});

	it("+ then - returns to the original size", () => {
		let adjustment = accumulateAdjustment(NO_ADJUSTMENT, { type: "scale", factor: SCALE_STEP }, px);
		adjustment = accumulateAdjustment(adjustment, { type: "scale", factor: 1 / SCALE_STEP }, px);
		const result = applyAdjustment(box, adjustment, "text");
		expect(result.size.width).toBeCloseTo(box.size.width);
		expect(result.fontSize).toBe(32);
	});
});

describe("reorderedZIndexes", () => {
	const regions = [
		{ id: "a", zIndex: 1 },
		{ id: "b", zIndex: 2 },
		{ id: "c", zIndex: 3 },
	];

	it("swaps with the neighbour above and below", () => {
		const up = reorderedZIndexes(regions, "a", "up")!;
		expect(up.get("a")).toBeGreaterThan(up.get("b")!);
		expect(up.get("c")).toBeGreaterThan(up.get("a")!);
		const down = reorderedZIndexes(regions, "c", "down")!;
		expect(down.get("c")).toBeLessThan(down.get("b")!);
	});

	it("does nothing at either end", () => {
		expect(reorderedZIndexes(regions, "c", "up")).toBeNull();
		expect(reorderedZIndexes(regions, "a", "down")).toBeNull();
		expect(reorderedZIndexes(regions, "zzz", "up")).toBeNull();
	});

	it("still moves when two layers share a stacking value", () => {
		const tied = [
			{ id: "a", zIndex: 5 },
			{ id: "b", zIndex: 5 },
		];
		const up = reorderedZIndexes(tied, "a", "up")!;
		expect(new Set(up.values()).size).toBe(2);
	});
});
