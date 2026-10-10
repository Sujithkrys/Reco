import { describe, expect, it } from "vitest";
import { fileNameFromPath, resolveProjectDisplayName } from "./projectDisplayName";

const ID = "3f2b8c1e-9a4d-4e7f-b2c6-1d5e8f0a7b39";

describe("project display name", () => {
	it("uses the stored project record's name", () => {
		expect(
			resolveProjectDisplayName({ storedName: "talking demo", projectPath: ID, libraryName: null }),
		).toBe("talking demo");
	});

	it("falls back to the library entry when the record has not been read yet", () => {
		expect(resolveProjectDisplayName({ libraryName: "Launch.reco", projectPath: ID })).toBe(
			"Launch",
		);
	});

	it("never shows a web project id or a blob URL id", () => {
		expect(
			resolveProjectDisplayName({
				projectPath: ID,
				sourcePath: `blob:http://localhost:5173/${ID}`,
			}),
		).toBe("Untitled project");
	});

	it("ignores a stored name that is itself an id (projects saved by older builds)", () => {
		expect(resolveProjectDisplayName({ storedName: ID, projectPath: ID })).toBe(
			"Untitled project",
		);
	});

	it("still names desktop projects after their file", () => {
		expect(resolveProjectDisplayName({ projectPath: "C:\\Videos\\Demo day.reco" })).toBe(
			"Demo day",
		);
		expect(fileNameFromPath("/Users/me/Movies/screen.mp4")).toBe("screen");
		expect(fileNameFromPath("idb://media_abc")).toBeNull();
	});
});
