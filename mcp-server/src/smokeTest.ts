// Manual end-to-end check for Phase 3, run directly (no MCP client needed):
//   npx tsx src/smokeTest.ts <project_id>
//
// Requires .env to be filled in (see README.md) and a real project id from
// your `projects` table. Exercises the exact same code path the MCP tools
// use: submit a spec -> render on Railway -> upload to Supabase Storage ->
// insert/read the motion_graphic_clips row.

import "dotenv/config";
import { createMotionGraphic } from "./tools/createMotionGraphic.js";
import { editMotionGraphic } from "./tools/editMotionGraphic.js";
import { getMotionGraphicStatus } from "./tools/getMotionGraphicStatus.js";

async function pollUntilDone(clipId: string) {
	for (let attempt = 0; attempt < 220; attempt++) {
		const status = await getMotionGraphicStatus(clipId);
		if (status.status === "done") return status;
		if (status.status === "error") throw new Error(`Render failed: ${status.error}`);
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}
	throw new Error("Timed out waiting for render");
}

async function main() {
	const projectId = process.argv[2];
	if (!projectId) {
		console.error("Usage: npx tsx src/smokeTest.ts <project_id>");
		process.exit(1);
	}

	console.log("Creating motion graphic...");
	const created = await createMotionGraphic(projectId, {
		code: `import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export default function GeneratedVideo() {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
	return (
		<AbsoluteFill style={{ backgroundColor: "#0A0A0F", justifyContent: "center", alignItems: "center" }}>
			<div style={{ opacity, color: "white", fontSize: 64, fontWeight: 700, fontFamily: "sans-serif" }}>
				MCP smoke test
			</div>
		</AbsoluteFill>
	);
}
`,
		durationInFrames: 45,
	});
	console.log("Submitted:", created);
	const createdResult = await pollUntilDone(created.clipId);
	console.log("Created:", createdResult);

	console.log("Editing motion graphic...");
	const edited = await editMotionGraphic(projectId, created.clipId, {
		code: `import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export default function GeneratedVideo() {
	const frame = useCurrentFrame();
	const scale = interpolate(frame, [0, 20], [0.8, 1], { extrapolateRight: "clamp" });
	return (
		<AbsoluteFill style={{ backgroundColor: "#111827", justifyContent: "center", alignItems: "center" }}>
			<div style={{ transform: \`scale(\${scale})\`, color: "#22c55e", fontSize: 56, fontWeight: 700, fontFamily: "sans-serif" }}>
				edit_motion_graphic works too
			</div>
		</AbsoluteFill>
	);
}
`,
		durationInFrames: 45,
	});
	console.log("Submitted:", edited);
	const editedResult = await pollUntilDone(edited.clipId);
	console.log("Edited:", editedResult);
}

main().catch((error) => {
	console.error("Smoke test failed:", error);
	process.exit(1);
});
