// Mirrors the Zod schema in the remo-clone render service
// (src/templates/schema.ts in https://github.com/Sujithkrys/remo-clone).
// That repo is the actual source of truth for what a valid spec looks like
// — this copy exists only so the MCP tools can validate a spec locally
// (better error messages for Claude) before making a network call, and so
// the tool's input schema can describe the shape without a cross-repo
// dependency. If the templates in remo-clone gain new scenes/props, update
// both places.

import { z } from "zod";

export const iconNameSchema = z.enum([
	"check",
	"star",
	"warning",
	"arrowRight",
	"heart",
	"bolt",
	"info",
]);

export const textRevealPropsSchema = z.object({
	text: z.string().min(1),
	subtext: z.string().optional(),
	color: z.string().optional(),
	backgroundColor: z.string().optional(),
	durationInFrames: z.number().int().positive().optional(),
});

export const iconCalloutPropsSchema = z.object({
	icon: iconNameSchema,
	text: z.string().min(1),
	subtext: z.string().optional(),
	color: z.string().optional(),
	backgroundColor: z.string().optional(),
	durationInFrames: z.number().int().positive().optional(),
});

export const chartDataPointSchema = z.object({
	label: z.string().min(1),
	value: z.number(),
});

export const chartAnimationPropsSchema = z.object({
	title: z.string().optional(),
	data: z.array(chartDataPointSchema).min(1),
	color: z.string().optional(),
	backgroundColor: z.string().optional(),
	unit: z.string().optional(),
	durationInFrames: z.number().int().positive().optional(),
});

export const beforeAfterSplitPropsSchema = z.object({
	beforeLabel: z.string().min(1),
	afterLabel: z.string().min(1),
	beforeColor: z.string().optional(),
	afterColor: z.string().optional(),
	textColor: z.string().optional(),
	durationInFrames: z.number().int().positive().optional(),
});

export const sceneSchema = z.discriminatedUnion("template", [
	z.object({ template: z.literal("textReveal"), props: textRevealPropsSchema }),
	z.object({ template: z.literal("iconCallout"), props: iconCalloutPropsSchema }),
	z.object({ template: z.literal("chartAnimation"), props: chartAnimationPropsSchema }),
	z.object({ template: z.literal("beforeAfterSplit"), props: beforeAfterSplitPropsSchema }),
]);

export const motionGraphicSpecSchema = z.object({
	scenes: z.array(sceneSchema).min(1),
	fps: z.number().int().positive().optional(),
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
});

export type MotionGraphicSpec = z.infer<typeof motionGraphicSpecSchema>;
