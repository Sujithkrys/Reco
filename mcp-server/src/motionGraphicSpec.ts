// Mirrors the shape remo-clone's /render endpoint actually accepts
// (server/index.ts + server/codeValidation.ts in
// https://github.com/Sujithkrys/remo-clone). That repo is the source of
// truth for what's allowed (the import allowlist, disallowed patterns) —
// this copy exists only so the MCP tool's input schema can describe the
// shape without a cross-repo dependency, and to fail fast locally with a
// clear error before making a network call.

import { z } from "zod";

export const motionGraphicSpecSchema = z.object({
	code: z
		.string()
		.min(1)
		.describe(
			"A complete React component, written as if you had Remotion attached and were " +
				"generating a video yourself. Must have a default export (the video component). " +
				"May import from: react, remotion, @remotion/transitions, @remotion/shapes, " +
				"@remotion/animation-utils, @remotion/paths, @remotion/noise, @remotion/motion-blur, " +
				"@remotion/layout-utils, @remotion/google-fonts. No other imports, no require(), " +
				"process, fs, child_process, eval, dynamic import(), fetch, XMLHttpRequest, or " +
				"WebSocket — the render server statically rejects these. Do not export anything " +
				"named durationInFrames, fps, width, or height; those are injected by the render " +
				"server from the fields below.",
		),
	durationInFrames: z
		.number()
		.int()
		.positive()
		.describe("Total video length in frames (frames = seconds * fps)."),
	fps: z.number().int().positive().optional().describe("Defaults to 30."),
	width: z.number().int().positive().optional().describe("Defaults to 1920."),
	height: z.number().int().positive().optional().describe("Defaults to 1080."),
});

export type MotionGraphicSpec = z.infer<typeof motionGraphicSpecSchema>;
