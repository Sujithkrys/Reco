import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS, matchesRedo } from "./shortcuts";

const key = (k: string, over: Partial<KeyboardEventInit> = {}) =>
	({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over }) as KeyboardEvent;
const redo = (e: KeyboardEvent, mac: boolean) => matchesRedo(e, DEFAULT_SHORTCUTS.redo, mac);

describe("matchesRedo", () => {
	it("Ctrl+Y and Ctrl+Shift+Z redo on Windows and Linux", () => {
		expect(redo(key("y", { ctrlKey: true }), false)).toBe(true);
		expect(redo(key("Y", { ctrlKey: true }), false)).toBe(true);
		expect(redo(key("z", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
		expect(redo(key("Z", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
	});

	it("Cmd+Shift+Z and Cmd+Y redo on Mac, and Ctrl does not", () => {
		expect(redo(key("z", { metaKey: true, shiftKey: true }), true)).toBe(true);
		expect(redo(key("y", { metaKey: true }), true)).toBe(true);
		expect(redo(key("y", { ctrlKey: true }), true)).toBe(false);
	});

	it("plain Ctrl+Z (undo), a bare Y and Alt combinations do not redo", () => {
		expect(redo(key("z", { ctrlKey: true }), false)).toBe(false);
		expect(redo(key("y"), false)).toBe(false);
		expect(redo(key("y", { ctrlKey: true, altKey: true }), false)).toBe(false);
		expect(redo(key("y", { ctrlKey: true, shiftKey: true }), false)).toBe(false);
	});

	it("still honours a rebound redo shortcut", () => {
		const rebound = { key: "r", ctrl: true };
		expect(matchesRedo(key("r", { ctrlKey: true }), rebound, false)).toBe(true);
	});
});
