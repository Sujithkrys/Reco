import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./ColorPicker";

vi.mock("../../contexts/I18nContext", () => ({
	useScopedT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));

vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });

const base = {
	value: "#2563eb",
	presets: ["#FF0000", "#00FF00"],
	onChange: () => {},
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("ColorPicker", () => {
	it("shows the hex and RGB inputs for the current colour", () => {
		vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
		const html = renderToStaticMarkup(<ColorPicker {...base} />);
		expect(html).toContain('value="2563eb"');
		expect(html).toContain('aria-label="Red"');
		expect(html).toContain('value="37"');
		expect(html).toContain('value="99"');
		expect(html).toContain('value="235"');
	});

	it("hides the opacity bar and field unless the field can store alpha", () => {
		vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
		expect(renderToStaticMarkup(<ColorPicker {...base} />)).not.toContain('aria-label="Opacity"');
		expect(renderToStaticMarkup(<ColorPicker {...base} allowAlpha />)).toContain('aria-label="Opacity"');
	});

	it("lists presets and project colours, and offers no fill only when asked", () => {
		vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
		const html = renderToStaticMarkup(
			<ColorPicker {...base} projectColors={["#123456"]} onClear={() => {}} clearLabel="No background" />,
		);
		expect(html).toContain('title="#FF0000"');
		expect(html).toContain("In this project");
		expect(html).toContain('title="#123456"');
		expect(html).toContain("No background");
		expect(renderToStaticMarkup(<ColorPicker {...base} />)).not.toContain("No background");
	});

	it("shows a non-hex value such as transparent as black", () => {
		vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
		expect(renderToStaticMarkup(<ColorPicker {...base} value="transparent" />)).toContain(
			'value="000000"',
		);
	});
});
