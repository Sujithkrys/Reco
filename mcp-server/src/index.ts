import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { env } from "./env.js";
import { motionGraphicSpecSchema } from "./motionGraphicSpec.js";
import { createMotionGraphic } from "./tools/createMotionGraphic.js";
import { editMotionGraphic } from "./tools/editMotionGraphic.js";
import { getMotionGraphicStatus } from "./tools/getMotionGraphicStatus.js";

function createServer(): McpServer {
	const server = new McpServer({ name: "reco-motion-graphics", version: "1.0.0" });

	server.registerTool(
		"create_motion_graphic",
		{
			title: "Create motion graphic",
			description:
				"Renders a custom motion graphics video from code you write yourself, and attaches " +
				"it to a Reco project as a new clip. You are the motion designer here, not a template " +
				"picker — treat 'go all out' / 'showreel quality' / 'impress me' requests completely " +
				"literally, as a real creative-coding brief, not something to satisfy with the fastest " +
				"trivial output. A good result for a 10-15s piece is genuinely substantial code (a few " +
				"hundred lines is normal, not a smell) and a render that takes real minutes, not " +
				"seconds — if what you wrote renders in a few seconds, that's a signal you under-built " +
				"it, not that you were efficient.\n\n" +
				"The strongest results come from hand-drawn procedural animation on an HTML5 <canvas>, " +
				"not from simple declarative helpers — the same way a demoscene/creative-coding piece " +
				"is built, ported to Remotion's frame model:\n" +
				"- Structure the piece as a sequence of distinct named scenes/beats (e.g. functions " +
				"s1(t), s2(t), ...), each owning a time range of t = frame / fps, dispatched from one " +
				"renderFrame(t, frame) function that also layers shared finishing passes (vignette, " +
				"grain, glitch, HUD/timecode overlay, screen-shake) on top every frame.\n" +
				"- Write your own easing functions (outExpo, outBack, outElastic, inOutCubic, etc. — " +
				"the standard Penner formulas) rather than relying only on spring()/interpolate() for " +
				"everything; a seg(t, a, b) helper that maps a time range to a clamped 0-1 progress, " +
				"then easing that, is the core building block for every beat.\n" +
				"- Draw with the canvas 2D context directly (fillRect, arc, bezier/quadratic curves, " +
				"gradients, clipping, save/restore, ctx.font + fillText for kinetic typography) for " +
				"real control over shape, particles, and composition — plain DOM/CSS elements are fine " +
				"for simple pieces, but canvas is what unlocks real visual sophistication (particle " +
				"systems, morphing shapes, procedural texture/grain, glitch displacement).\n" +
				"- Use remotion's random(seed) — never Math.random() — for anything stochastic (grain, " +
				"glitch, particle jitter). Seed it by a string that includes the frame number (e.g. " +
				"`glitch-y-${frame}-${i}`) so a given frame looks identical no matter which parallel " +
				"render worker produces it; Math.random() is not frame-deterministic and causes visible " +
				"flicker between adjacent frames.\n" +
				"- If you load custom fonts, use delayRender()/continueRender() (both from 'remotion') " +
				"to block the first frame until document.fonts.load(...) resolves for each font/weight " +
				"you use — otherwise text can render in a fallback font on early frames.\n" +
				"- Default export a single React component (frame-driven via useCurrentFrame() from " +
				"'remotion'). An AbsoluteFill wrapping a <canvas> you draw into via useLayoutEffect, " +
				"redrawn every frame, is the usual shape of the component itself — the actual visual " +
				"work happens in the plain-JS drawing functions it calls, not in JSX.\n\n" +
				"Available imports: react, remotion (Composition, AbsoluteFill, Sequence, Series, " +
				"useCurrentFrame, useVideoConfig, interpolate, spring, Easing, random, delayRender, " +
				"continueRender, Img, staticFile), @remotion/transitions (+ /fade, /slide, /wipe, /flip, " +
				"/clock-wipe, /none subpaths), @remotion/shapes, @remotion/animation-utils, " +
				"@remotion/paths, @remotion/motion-blur, @remotion/layout-utils, @remotion/google-fonts " +
				"(use this for custom typography — @fontsource and other font packages aren't installed " +
				"on the render server; @remotion/noise is also not available — its simplex-noise " +
				"dependency fails to bundle on this server, use remotion's own random() for any " +
				"seeded/organic noise instead). Nothing else — no npm install, no fetch/XHR/WebSocket, " +
				"no fs/process/child_process/eval/require/dynamic import. Don't export anything named " +
				"durationInFrames, fps, width, or height — the render server injects those from the " +
				"fields you pass alongside code. Pick durationInFrames/fps deliberately to match the " +
				"pacing the request calls for, not a default.\n\n" +
				"This will take real time to render (potentially several minutes) — that's expected " +
				"for real per-frame canvas work, not a problem to work around. Returns immediately with " +
				"the clip's id and status 'rendering' — the render itself continues in the background. " +
				"Poll get_motion_graphic_status with that clip_id until it reports status 'done' (with " +
				"a video_url) or 'error'. Do not call create_motion_graphic again for the same request " +
				"while waiting — that creates a duplicate clip; if a status check itself fails (a " +
				"dropped connection, a 502), retry the status check, not the creation.",
			inputSchema: {
				project_id: z.string().uuid().describe("The Reco project this clip belongs to"),
				spec: motionGraphicSpecSchema.describe("The Remotion code and render settings"),
			},
		},
		async ({ project_id, spec }) => {
			const result = await createMotionGraphic(project_id, spec);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ clip_id: result.clipId, status: result.status }),
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
				"Re-renders an existing motion graphic clip with updated Remotion code. Fetch or " +
				"recall the clip's current code first, apply the requested change to it (same code " +
				"quality bar as create_motion_graphic — this is still your own custom Remotion " +
				"component, not a template), then pass the full updated code here — this replaces " +
				"the clip's code and video entirely, it does not merge/patch. Same async pattern as " +
				"create_motion_graphic: returns immediately with status 'rendering', poll " +
				"get_motion_graphic_status with the clip_id rather than calling this again.",
			inputSchema: {
				project_id: z.string().uuid().describe("The Reco project this clip belongs to"),
				clip_id: z.string().uuid().describe("The clip to update"),
				spec: motionGraphicSpecSchema.describe("The full updated Remotion code and render settings"),
			},
		},
		async ({ project_id, clip_id, spec }) => {
			const result = await editMotionGraphic(project_id, clip_id, spec);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ clip_id: result.clipId, status: result.status }),
					},
				],
			};
		},
	);

	server.registerTool(
		"get_motion_graphic_status",
		{
			title: "Get motion graphic status",
			description:
				"Checks the current status of a clip previously submitted via create_motion_graphic " +
				"or edit_motion_graphic. Poll this (a few seconds between calls is reasonable) until " +
				"status is 'done' (video_url will be set) or 'error' (error will explain what failed). " +
				"Safe to retry this call as many times as needed — a failed status check (a dropped " +
				"connection, a 502) never risks creating a duplicate clip, unlike calling " +
				"create_motion_graphic again would.",
			inputSchema: {
				clip_id: z.string().uuid().describe("The clip to check"),
			},
		},
		async ({ clip_id }) => {
			const result = await getMotionGraphicStatus(clip_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							clip_id: result.clipId,
							status: result.status,
							video_url: result.videoUrl,
							error: result.error,
						}),
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
