import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal hook runtime: state and refs persist by call order across "renders",
// and effects run when the test commits a render.
const hookSlots: unknown[] = [];
let hookIndex = 0;
let pendingEffects: Array<() => void> = [];
vi.mock("react", () => ({
	useRef: (initial: unknown) => {
		const index = hookIndex++;
		if (!(index in hookSlots)) hookSlots[index] = { current: initial };
		return hookSlots[index];
	},
	useState: (initial: unknown) => {
		const index = hookIndex++;
		if (!(index in hookSlots)) hookSlots[index] = initial;
		return [
			hookSlots[index],
			(next: unknown) => {
				hookSlots[index] = typeof next === "function" ? next(hookSlots[index]) : next;
			},
		];
	},
	useCallback: (callback: unknown) => {
		hookIndex++;
		return callback;
	},
	useEffect: (effect: () => void) => {
		hookIndex++;
		pendingEffects.push(effect);
	},
}));

import { useEditorHistory } from "./useEditorHistory";

type State = Record<string, unknown>;

function createEditor(initial: State) {
	const state: State = { ...initial };
	const setter = (key: string) => (value: unknown) => {
		state[key] = value;
	};
	const timeline = () =>
		({
			...state,
			setZoomRegions: setter("zoomRegions"),
			setClipRegions: setter("clipRegions"),
			setSpeedRegions: setter("speedRegions"),
			setAnnotationRegions: setter("annotationRegions"),
			setAudioRegions: setter("audioRegions"),
			setAutoCaptions: setter("autoCaptions"),
			setSelectedZoomId: setter("selectedZoomId"),
			setSelectedClipId: setter("selectedClipId"),
			setSelectedAnnotationId: setter("selectedAnnotationId"),
			setSelectedAudioId: setter("selectedAudioId"),
		}) as unknown as Parameters<typeof useEditorHistory>[0]["timeline"];
	const refs = {
		nextZoomIdRef: { current: 1 },
		nextClipIdRef: { current: 1 },
		nextAnnotationIdRef: { current: 1 },
		nextAudioIdRef: { current: 1 },
		nextAnnotationZIndexRef: { current: 1 },
	};
	const render = (beforeOwnEffects?: (history: ReturnType<typeof useEditorHistory>) => void) => {
		hookIndex = 0;
		pendingEffects = [];
		const history = useEditorHistory({ timeline: timeline(), ...refs });
		// Child effects (the timeline's normalization) run before the editor's own.
		beforeOwnEffects?.(history);
		for (const effect of pendingEffects) effect();
		return history;
	};
	return { state, render };
}

const clip = (endMs: number) => [{ id: "clip-1", startMs: 0, endMs, speed: 1 }];
const zoom = (startMs: number, endMs: number) => [
	{ id: "zoom-1", startMs, endMs, depth: 2, focus: { cx: 0.5, cy: 0.5 } },
];

beforeEach(() => {
	hookSlots.length = 0;
});

describe("editor history with timeline clamping", () => {
	it("folds a clamp caused by an edit into that edit, so one undo reverts both", () => {
		const editor = createEditor({
			zoomRegions: zoom(12_340, 13_340),
			clipRegions: clip(20_000),
			speedRegions: [],
			annotationRegions: [],
			audioRegions: [],
			autoCaptions: [],
			selectedZoomId: null,
			selectedClipId: null,
			selectedAnnotationId: null,
			selectedAudioId: null,
		});
		editor.render();

		// Trim the clip's end; the timeline then clamps the zoom past the new end.
		editor.state.clipRegions = clip(12_000);
		editor.render((history) => history.amendCurrentStep());
		editor.state.zoomRegions = zoom(11_900, 12_000);
		let history = editor.render();

		history.handleUndo();
		history = editor.render();
		expect(editor.state.clipRegions).toEqual(clip(20_000));
		expect(editor.state.zoomRegions).toEqual(zoom(12_340, 13_340));
		expect(history.canRedo).toBe(true);

		history.handleRedo();
		editor.render();
		expect(editor.state.clipRegions).toEqual(clip(12_000));
		expect(editor.state.zoomRegions).toEqual(zoom(11_900, 12_000));
	});

	it("still records an ordinary edit as its own step", () => {
		const editor = createEditor({
			zoomRegions: [],
			clipRegions: clip(20_000),
			speedRegions: [],
			annotationRegions: [],
			audioRegions: [],
			autoCaptions: [],
			selectedZoomId: null,
			selectedClipId: null,
			selectedAnnotationId: null,
			selectedAudioId: null,
		});
		editor.render();
		editor.state.clipRegions = clip(15_000);
		editor.render();
		editor.state.clipRegions = clip(10_000);
		const history = editor.render();

		history.handleUndo();
		editor.render();
		expect(editor.state.clipRegions).toEqual(clip(15_000));
	});
});
