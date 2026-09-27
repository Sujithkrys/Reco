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

async function main() {
	const projectId = process.argv[2];
	if (!projectId) {
		console.error("Usage: npx tsx src/smokeTest.ts <project_id>");
		process.exit(1);
	}

	console.log("Creating motion graphic...");
	const created = await createMotionGraphic(projectId, {
		scenes: [
			{
				template: "textReveal",
				props: {
					text: "MCP smoke test",
					subtext: "create_motion_graphic",
					durationInFrames: 45,
				},
			},
		],
	});
	console.log("Created:", created);

	console.log("Editing motion graphic...");
	const edited = await editMotionGraphic(projectId, created.clipId, {
		scenes: [
			{
				template: "iconCallout",
				props: {
					icon: "check",
					text: "edit_motion_graphic works too",
					durationInFrames: 45,
				},
			},
		],
	});
	console.log("Edited:", edited);
}

main().catch((error) => {
	console.error("Smoke test failed:", error);
	process.exit(1);
});
