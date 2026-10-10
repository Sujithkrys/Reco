import { afterEach, describe, expect, it, vi } from "vitest";
import { addRecentColor, getRecentColors, MAX_RECENT_COLORS, pushRecentColor } from "./recentColors";

function stubStorage(initial: Record<string, string> = {}) {
	const data = { ...initial };
	vi.stubGlobal("window", {
		localStorage: {
			getItem: (k: string) => data[k] ?? null,
			setItem: (k: string, v: string) => {
				data[k] = v;
			},
		},
	});
	return data;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("pushRecentColor", () => {
	it("puts the newest first, dedupes and caps at 12", () => {
		let list: string[] = [];
		for (let i = 0; i < 15; i++) list = pushRecentColor(list, `#0000${i.toString(16).padStart(2, "0")}`);
		expect(list).toHaveLength(MAX_RECENT_COLORS);
		expect(list[0]).toBe("#00000e");
		expect(pushRecentColor(["#111111", "#222222"], "#222222")).toEqual(["#222222", "#111111"]);
		expect(pushRecentColor(["#111111"], "ABC")).toEqual(["#aabbcc", "#111111"]);
	});

	it("ignores invalid colours", () => {
		expect(pushRecentColor(["#111111"], "nope")).toEqual(["#111111"]);
	});
});

describe("recent colours storage", () => {
	it("stores and reads back", () => {
		stubStorage();
		addRecentColor("#ff0000");
		addRecentColor("#00ff00");
		expect(getRecentColors()).toEqual(["#00ff00", "#ff0000"]);
	});

	it("survives corrupt data and a storage that throws", () => {
		stubStorage({ "reco.recentColors": "{not json" });
		expect(getRecentColors()).toEqual([]);
		vi.stubGlobal("window", {
			localStorage: {
				getItem: () => {
					throw new Error("blocked");
				},
				setItem: () => {
					throw new Error("blocked");
				},
			},
		});
		expect(getRecentColors()).toEqual([]);
		expect(addRecentColor("#123456")).toEqual(["#123456"]);
	});
});
