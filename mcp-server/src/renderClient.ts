import { env } from "./env.js";
import type { MotionGraphicSpec } from "./motionGraphicSpec.js";

interface RenderStatus {
	status: "pending" | "rendering" | "done" | "error";
	progress: number;
	error?: string;
}

const POLL_INTERVAL_MS = 3000;
// Sophisticated per-frame canvas rendering (particle systems, procedural
// effects) is real work multiplied across every frame -- genuinely good
// output takes real time, matching remo-clone's own 10-minute render
// timeout, not a rush to return something in seconds.
const MAX_POLL_ATTEMPTS = 220; // ~11 minutes, just past remo-clone's own cap

export async function submitRender(spec: MotionGraphicSpec): Promise<string> {
	const res = await fetch(`${env.renderServiceUrl}/render`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(spec),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Render service rejected the spec (${res.status}): ${body}`);
	}

	const { jobId } = (await res.json()) as { jobId: string };
	return jobId;
}

export async function waitForRender(jobId: string): Promise<void> {
	for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
		const res = await fetch(`${env.renderServiceUrl}/render/${jobId}/status`);
		if (!res.ok) {
			throw new Error(`Failed to check render status (${res.status})`);
		}
		const status = (await res.json()) as RenderStatus;
		if (status.status === "done") return;
		if (status.status === "error") {
			throw new Error(`Render failed: ${status.error ?? "unknown error"}`);
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	throw new Error("Render timed out after 11 minutes");
}

export async function fetchRenderResult(jobId: string): Promise<Buffer> {
	const res = await fetch(`${env.renderServiceUrl}/render/${jobId}/result`);
	if (!res.ok) {
		throw new Error(`Failed to download render result (${res.status})`);
	}
	const arrayBuffer = await res.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

/** Submits a spec, waits for it to finish, and returns the rendered MP4 bytes. */
export async function renderSpecToVideo(spec: MotionGraphicSpec): Promise<Buffer> {
	const jobId = await submitRender(spec);
	await waitForRender(jobId);
	return fetchRenderResult(jobId);
}
