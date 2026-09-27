import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { motionGraphicSpecSchema } from "./motionGraphicSpec.js";
import { createMotionGraphic } from "./tools/createMotionGraphic.js";
import { editMotionGraphic } from "./tools/editMotionGraphic.js";

const server = new McpServer({ name: "reco-motion-graphics", version: "1.0.0" });

server.registerTool(
	"create_motion_graphic",
	{
		title: "Create motion graphic",
		description:
			"Renders a motion graphic video from a spec (an ordered list of scenes, each a " +
			"template name + props) and attaches it to a Reco project as a new clip. " +
			"Returns the clip's id and a durable video URL. Use the textReveal, iconCallout, " +
			"chartAnimation, and beforeAfterSplit templates.",
		inputSchema: {
			project_id: z.string().uuid().describe("The Reco project this clip belongs to"),
			spec: motionGraphicSpecSchema.describe("The motion graphic spec to render"),
		},
	},
	async ({ project_id, spec }) => {
		const result = await createMotionGraphic(project_id, spec);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({ clip_id: result.clipId, video_url: result.videoUrl }),
				},
			],
		};
	},
);

server.registerTool(
	"edit_motion_graphic",
	{
		title: "Edit motion graphic",
		description:
			"Re-renders an existing motion graphic clip with an updated spec. Fetch or recall " +
			"the clip's current spec first, apply the requested change to it, then pass the " +
			"full updated spec here — this replaces the clip's spec and video entirely.",
		inputSchema: {
			project_id: z.string().uuid().describe("The Reco project this clip belongs to"),
			clip_id: z.string().uuid().describe("The clip to update"),
			spec: motionGraphicSpecSchema.describe("The full updated motion graphic spec"),
		},
	},
	async ({ project_id, clip_id, spec }) => {
		const result = await editMotionGraphic(project_id, clip_id, spec);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({ clip_id: result.clipId, video_url: result.videoUrl }),
				},
			],
		};
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
