import { describe, expect, it } from "vitest";
import { shouldCaptureThumbnail, THUMBNAIL_REFRESH_MS } from "./thumbnailPolicy";

describe("shouldCaptureThumbnail", () => {
	it("captures when none has been captured yet", () => {
		expect(shouldCaptureThumbnail(null, 1000)).toBe(true);
		expect(shouldCaptureThumbnail(undefined, 1000)).toBe(true);
		expect(shouldCaptureThumbnail(Number.NaN, 1000)).toBe(true);
	});

	it("waits out the refresh interval, then captures again", () => {
		expect(shouldCaptureThumbnail(1000, 1000 + THUMBNAIL_REFRESH_MS - 1)).toBe(false);
		expect(shouldCaptureThumbnail(1000, 1000 + THUMBNAIL_REFRESH_MS)).toBe(true);
	});
});
