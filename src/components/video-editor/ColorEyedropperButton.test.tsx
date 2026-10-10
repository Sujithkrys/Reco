import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ColorEyedropperButton,
	isEyedropperSupported,
	pickColorWithEyedropper,
} from "./ColorEyedropperButton";

vi.mock("../../contexts/I18nContext", () => ({
	useScopedT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));

function stubWindow(eyeDropper?: unknown) {
	vi.stubGlobal("window", eyeDropper ? { EyeDropper: eyeDropper } : {});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("ColorEyedropperButton", () => {
	it("renders nothing where the browser has no EyeDropper API", () => {
		stubWindow();
		expect(isEyedropperSupported()).toBe(false);
		expect(renderToStaticMarkup(<ColorEyedropperButton onPick={() => {}} />)).toBe("");
	});

	it("renders a button where the API exists", () => {
		stubWindow(class {});
		expect(isEyedropperSupported()).toBe(true);
		expect(renderToStaticMarkup(<ColorEyedropperButton onPick={() => {}} />)).toContain("<button");
	});

	it("passes the picked colour to onPick as lowercase hex", async () => {
		stubWindow(
			class {
				open = async () => ({ sRGBHex: "#1A2B3C" });
			},
		);
		const onPick = vi.fn();
		await pickColorWithEyedropper(onPick);
		expect(onPick).toHaveBeenCalledExactlyOnceWith("#1a2b3c");
	});

	it("keeps the colour when the picker is cancelled", async () => {
		stubWindow(
			class {
				open = async () => {
					throw new DOMException("cancelled", "AbortError");
				};
			},
		);
		const onPick = vi.fn();
		await pickColorWithEyedropper(onPick);
		expect(onPick).not.toHaveBeenCalled();
	});

	it("does nothing without the API", async () => {
		stubWindow();
		const onPick = vi.fn();
		await pickColorWithEyedropper(onPick);
		expect(onPick).not.toHaveBeenCalled();
	});
});
