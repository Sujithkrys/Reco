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
				"Two technique families reliably produce real quality here — pick whichever suits the " +
				"creative concept, or mix them in different scenes of the same piece:\n\n" +
				"(A) Procedural canvas drawing — a demoscene/creative-coding approach. Structure the " +
				"piece as named scene functions (s1(t), s2(t), ...) each owning a time range of " +
				"t = frame / fps, dispatched from one renderFrame(t, frame) that also layers shared " +
				"finishing passes (vignette, grain, HUD/timecode, screen-shake) on top every frame. " +
				"Write your own easing functions (outExpo, outBack, outElastic, inOutCubic — the " +
				"standard Penner formulas) and a seg(t, a, b) helper mapping a time range to clamped " +
				"0-1 progress. Draw with the canvas 2D context directly (fillRect, arc, bezier curves, " +
				"gradients, clipping, ctx.font + fillText) inside a component that's an AbsoluteFill " +
				"wrapping a <canvas>, redrawn every frame via useLayoutEffect.\n\n" +
				"(B) Declarative SVG + DOM/CSS — often the stronger choice for clean geometric or " +
				"typographic pieces. Build actual JSX (<svg>, <circle>, <path>, <line>, <g>) and drive " +
				"text/panel animation with inline CSS (transform, clipPath, mixBlendMode, " +
				"WebkitTextStroke) computed via a small tween(frame, [inFrame, outFrame], [from, to], " +
				"easing) helper built on remotion's own interpolate(), using custom cubic-bezier easing " +
				"curves (Easing.bezier(0.16, 1, 0.3, 1) for a strong ease-out, etc. — see the Easing " +
				"import) rather than only its built-in presets. Strong techniques in this family: " +
				"morphing one shape into another by interpolating an SVG path's per-angle radius " +
				"between two polygon vertex counts; scene transitions built as a small wrapper " +
				"component that clips its children with clipPath (a circle for an iris wipe, an " +
				"inset() for a directional wipe, a polygon() for a diagonal wipe) driven by the same " +
				"tween helper; a HUD layer (corner brackets, live timecode, scene counter, progress " +
				"bar, footer credit) using mixBlendMode: 'difference' so it stays legible over any " +
				"background; and film grain via an SVG <feTurbulence type=\"fractalNoise\"> filter " +
				"applied to a full-frame overlay rect — much cheaper than canvas pixel manipulation.\n\n" +
				"Whichever family (or mix) you use: default export a single React component, frame-" +
				"driven via useCurrentFrame() from 'remotion'. If you load custom fonts, use " +
				"delayRender()/continueRender() (both from 'remotion') to block the first frame until " +
				"document.fonts.load(...) resolves for each font/weight — otherwise text can render in " +
				"a fallback font on early frames. Use remotion's random(seed) — never Math.random() — " +
				"for anything stochastic; seed by a string including the frame number (e.g. " +
				"`p-${frame}-${i}`) so a given frame looks identical no matter which parallel render " +
				"worker produces it.\n\n" +
				"Everything must be one file: no separate scene files importing from a shared utils/" +
				"fonts module like a real multi-file Remotion project might have — define every helper " +
				"function, easing curve, and scene component in the single code string, in whatever " +
				"order makes sense (helpers first, then scene components, then the default-exported " +
				"root component that composes them with <Sequence>). Custom audio/sound design isn't " +
				"supported yet (no synthesizing or serving audio files) — build a purely visual piece.\n\n" +
				"Memory: the render server has a 1GB ceiling and has been OOM-killed by genuinely dense " +
				"1080p pieces (many simultaneous effects — particle bursts, multiple morphing shapes, " +
				"full-canvas post-processing — all layered together). Default to 1280x720 (the spec's " +
				"default) unless the request specifically needs full HD. Whatever resolution or " +
				"technique you use, avoid whole-canvas ctx.getImageData()/putImageData() every frame " +
				"for grain (expensive at 30+ fps — use a small pre-rendered noise tile with " +
				"ctx.createPattern(), or the SVG feTurbulence approach above), and create gradients/" +
				"patterns once (module scope or memoized) rather than inside the per-frame draw call.\n\n" +
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
				"for real per-frame work at this level of ambition, not a problem to work around. " +
				"Returns immediately with the clip's id and status 'rendering' — the render itself " +
				"continues in the background. Poll get_motion_graphic_status with that clip_id until " +
				"it reports status 'done' (with a video_url) or 'error'. Do not call " +
				"create_motion_graphic again for the same request while waiting — that creates a " +
				"duplicate clip; if a status check itself fails (a dropped connection, a 502), retry " +
				"the status check, not the creation.",
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
