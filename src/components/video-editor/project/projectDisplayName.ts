const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UNTITLED_PROJECT_NAME = "Untitled project";

/** Record ids and blob URLs end in a UUID; that is never a name to show anyone. */
export function isOpaqueId(value: string): boolean {
	return UUID_PATTERN.test(value.trim());
}

function cleanName(value: string | null | undefined): string | null {
	const name = value?.trim().replace(/\.reco$/i, "").trim();
	return name && !isOpaqueId(name) ? name : null;
}

/**
 * The file name (without extension) of a real file path. On the web, project
 * paths are record ids and video paths are blob/idb URLs, so neither has a name.
 */
export function fileNameFromPath(path: string | null | undefined): string | null {
	if (!path || /^(blob|idb|https?|data):/i.test(path)) return null;
	const fileName = path.split(/[\\/]/).pop() ?? "";
	return cleanName(fileName.replace(/\.reco$/i, "").replace(/\.[^.]+$/, ""));
}

/**
 * The editor header's project name: the stored project record's name first,
 * then the library entry's, then a real file name, then "Untitled project".
 * Never an id.
 */
export function resolveProjectDisplayName({
	storedName,
	libraryName,
	projectPath,
	sourcePath,
	untitled = UNTITLED_PROJECT_NAME,
}: {
	storedName?: string | null;
	libraryName?: string | null;
	projectPath?: string | null;
	sourcePath?: string | null;
	untitled?: string;
}): string {
	return (
		cleanName(storedName) ??
		cleanName(libraryName) ??
		fileNameFromPath(projectPath) ??
		fileNameFromPath(sourcePath) ??
		untitled
	);
}
