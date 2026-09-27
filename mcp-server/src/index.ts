import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { env } from "./env.js";
import { motionGraphicSpecSchema } from "./motionGraphicSpec.js";
import { createMotionGraphic } from "./tools/createMotionGraphic.js";
import { editMotionGraphic } from "./tools/editMotionGraphic.js";

function createServer(): McpServer {
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

	return server;
}

const app = express();
app.use(express.json());

// The auth token lives in the path (not a header) so it works with MCP clients
// whose connector UI only accepts a URL, like claude.ai's "custom connector"
// setup. Anyone who knows this exact URL can call the tools, so treat it like
// a password: only paste it into claude.ai's connector field, never share it.
app.post(`/mcp/${env.mcpAuthToken}`, async (req, res) => {
	const server = createServer();
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});

	res.on("close", () => {
		transport.close();
		server.close();
	});

	try {
		await server.connect(transport);
		await transport.handleRequest(req, res, req.body);
	} catch (error) {
		console.error("MCP request failed:", error);
		if (!res.headersSent) {
			res.status(500).json({
				jsonrpc: "2.0",
				error: { code: -32603, message: "Internal server error" },
				id: null,
			});
		}
	}
});

// Stateless mode doesn't support the GET (server-initiated stream) or DELETE
// (session teardown) verbs the Streamable HTTP spec otherwise allows.
app.get(`/mcp/${env.mcpAuthToken}`, (_req, res) => {
	res.status(405).json({ error: "Method not allowed (stateless server)" });
});
app.delete(`/mcp/${env.mcpAuthToken}`, (_req, res) => {
	res.status(405).json({ error: "Method not allowed (stateless server)" });
});

app.get("/health", (_req, res) => {
	res.json({ status: "ok" });
});

const port = Number(process.env.PORT) || 3002;
app.listen(port, () => {
	console.log(`Reco MCP server listening on port ${port}`);
});
