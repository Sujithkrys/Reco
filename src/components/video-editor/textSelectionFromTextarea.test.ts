import { afterEach, describe, expect, it } from "vitest";
import { clearTextSelection, getTextSelection, setTextSelection, textSelectionFromTextarea } from "./textSelectionStore";

afterEach(() => clearTextSelection());

describe("textSelectionFromTextarea", () => {
	it("maps the textarea's offsets one to one onto the layer's text", () => {
		expect(textSelectionFromTextarea("a", "Hello world", 6, 11)).toEqual({ annotationId: "a", start: 6, end: 11 });
	});

	it("orders a backward selection", () => {
		expect(textSelectionFromTextarea("a", "Hello world", 11, 6)).toEqual({ annotationId: "a", start: 6, end: 11 });
	});

	it("clamps to the text and treats a caret as no selection", () => {
		expect(textSelectionFromTextarea("a", "Hi", -4, 99)).toEqual({ annotationId: "a", start: 0, end: 2 });
		expect(textSelectionFromTextarea("a", "Hi", 1, 1)).toBeNull();
		expect(textSelectionFromTextarea("a", "", 0, 0)).toBeNull();
		expect(textSelectionFromTextarea("a", "Hi", null, null)).toBeNull();
	});

	it("counts a newline as one character, as the canvas does", () => {
		expect(textSelectionFromTextarea("a", "ab\ncd", 3, 5)).toEqual({ annotationId: "a", start: 3, end: 5 });
	});

	it("feeds the shared store, and a collapsed caret clears it", () => {
		setTextSelection(textSelectionFromTextarea("a", "Hello", 0, 2));
		expect(getTextSelection()).toEqual({ annotationId: "a", start: 0, end: 2 });
		setTextSelection(textSelectionFromTextarea("a", "Hello", 2, 2));
		expect(getTextSelection()).toBeNull();
	});
});
