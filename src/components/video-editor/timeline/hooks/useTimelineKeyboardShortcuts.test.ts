import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useTimelineKeyboardShortcuts } from "./useTimelineKeyboardShortcuts";

vi.mock("react", () => ({
	useEffect: (effect: () => void) => effect(),
	useRef: (initial: unknown) => ({ current: initial }),
}));

vi.mock("sonner", () => ({
	toast: vi.fn(),
}));

class Element {
	isContentEditable = false;
}
class Input extends Element {}
class Textarea extends Element {}
class Select extends Element {}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function setup(selectedClipId: string | null = "clip") {
	vi.stubGlobal("HTMLElement", Element);
	vi.stubGlobal("HTMLInputElement", Input);
	vi.stubGlobal("HTMLTextAreaElement", Textarea);
	vi.stubGlobal("HTMLSelectElement", Select);
	const addEventListener = vi.fn();
	vi.stubGlobal("window", { addEventListener, removeEventListener: vi.fn() });
	const deleteSelectedClip = vi.fn();
	// React useEffect is mocked to test listener registration without mounting a component.
	useTimelineKeyboardShortcuts({
		isTimelineFocusedRef: { current: false },
		selectedClipId,
		deleteSelectedClip,
	} as unknown as Parameters<typeof useTimelineKeyboardShortcuts>[0]);
	const handler = addEventListener.mock.calls[0][1] as (event: KeyboardEvent) => void;
	const press = (options: Record<string, unknown> = {}) => {
		const event = {
			key: "Backspace",
			target: new Element(),
			preventDefault: vi.fn(),
			...options,
		};
		handler(event as unknown as KeyboardEvent);
		return event;
	};
	return { press, deleteSelectedClip };
}

function setupLayer({
	targetType,
	selectedId,
	regions,
	currentTimeMs,
	selectedClipId = null,
	timelineFocused = true,
}: {
	targetType: "annotation" | "audio" | "caption";
	selectedId: string | null;
	regions: Array<{ id: string; startMs: number; endMs: number }>;
	currentTimeMs?: number;
	selectedClipId?: string | null;
	timelineFocused?: boolean;
}) {
	vi.stubGlobal("HTMLElement", Element);
	vi.stubGlobal("HTMLInputElement", Input);
	vi.stubGlobal("HTMLTextAreaElement", Textarea);
	vi.stubGlobal("HTMLSelectElement", Select);
	const addEventListener = vi.fn();
	vi.stubGlobal("window", { addEventListener, removeEventListener: vi.fn() });

	const deleteSelectedAnnotation = vi.fn();
	const deleteSelectedAudio = vi.fn();
	const deleteSelectedCaption = vi.fn();
	const deleteSelectedClip = vi.fn();

	useTimelineKeyboardShortcuts({
		isTimelineFocusedRef: { current: timelineFocused },
		selectedClipId,
		deleteSelectedClip,
		keyShortcuts: {
			addKeyframe: { key: "k" },
			addZoom: { key: "z" },
			splitClip: { key: "s" },
			addAnnotation: { key: "t" },
			deleteSelected: { key: "Backspace" },
			zoomIn: { key: "=" },
			zoomOut: { key: "-" },
		} as unknown as Parameters<typeof useTimelineKeyboardShortcuts>[0]["keyShortcuts"],
		selectedAnnotationId: targetType === "annotation" ? selectedId : null,
		selectedAudioId: targetType === "audio" ? selectedId : null,
		selectedCaptionId: targetType === "caption" ? selectedId : null,
		annotationRegions: targetType === "annotation" ? regions : undefined,
		audioRegions: targetType === "audio" ? regions : undefined,
		captionCues: targetType === "caption" ? regions : undefined,
		currentTimeMs,
		deleteSelectedAnnotation,
		deleteSelectedAudio,
		deleteSelectedCaption,
	} as unknown as Parameters<typeof useTimelineKeyboardShortcuts>[0]);

	const handler = addEventListener.mock.calls[0][1] as (event: KeyboardEvent) => void;
	const press = (key: "Backspace" | "Delete" = "Backspace") => {
		const event = {
			key,
			target: new Element(),
			preventDefault: vi.fn(),
		};
		handler(event as unknown as KeyboardEvent);
		return event;
	};

	return {
		press,
		deleteSelectedAnnotation,
		deleteSelectedAudio,
		deleteSelectedCaption,
		deleteSelectedClip,
	};
}

describe("selected clip Backspace", () => {
	it("deletes the selected clip without requiring timeline focus", () => {
		const { press, deleteSelectedClip } = setup();
		expect(press().preventDefault).toHaveBeenCalledOnce();
		expect(deleteSelectedClip).toHaveBeenCalledOnce();
	});
	it.each([
		new Input(),
		new Textarea(),
		new Select(),
		Object.assign(new Element(), { isContentEditable: true }),
	])("does not delete a clip while editing text or a form control", (target) => {
		const { press, deleteSelectedClip } = setup();
		expect(press({ target }).preventDefault).not.toHaveBeenCalled();
		expect(deleteSelectedClip).not.toHaveBeenCalled();
	});
	it("ignores consumed events, modifier shortcuts and missing selection", () => {
		const { press, deleteSelectedClip } = setup();
		for (const option of ["defaultPrevented", "ctrlKey", "metaKey", "altKey"])
			press({ [option]: true });
		expect(deleteSelectedClip).not.toHaveBeenCalled();
		const unselected = setup(null);
		unselected.press();
		expect(unselected.deleteSelectedClip).not.toHaveBeenCalled();
	});
});

describe("layer selected on top of a selected clip", () => {
	const deleteFns = {
		annotation: "deleteSelectedAnnotation",
		audio: "deleteSelectedAudio",
		caption: "deleteSelectedCaption",
	} as const;

	describe.each(["annotation", "audio", "caption"] as const)("%s", (targetType) => {
		it.each(["Backspace", "Delete"] as const)("%s deletes the layer, not the clip", (key) => {
			const result = setupLayer({
				targetType,
				selectedId: "layer-1",
				regions: [{ id: "layer-1", startMs: 1000, endMs: 3000 }],
				currentTimeMs: 2000,
				selectedClipId: "clip-1",
			});
			result.press(key);
			expect(result[deleteFns[targetType]]).toHaveBeenCalledOnce();
			expect(result.deleteSelectedClip).not.toHaveBeenCalled();
		});

		it("Backspace without timeline focus leaves the clip alone", () => {
			const result = setupLayer({
				targetType,
				selectedId: "layer-1",
				regions: [{ id: "layer-1", startMs: 1000, endMs: 3000 }],
				currentTimeMs: 2000,
				selectedClipId: "clip-1",
				timelineFocused: false,
			});
			result.press("Backspace");
			expect(result.deleteSelectedClip).not.toHaveBeenCalled();
			expect(result[deleteFns[targetType]]).not.toHaveBeenCalled();
		});
	});
});

describe("selected layer deletion with playhead position check", () => {
	const regions = [{ id: "layer-1", startMs: 1000, endMs: 3000 }];

	describe.each(["Backspace", "Delete"] as const)("with %s key", (key) => {
		it("deletes annotation when playhead is inside its span", () => {
			const { press, deleteSelectedAnnotation } = setupLayer({
				targetType: "annotation",
				selectedId: "layer-1",
				regions,
				currentTimeMs: 1500,
			});
			const event = press(key);
			expect(event.preventDefault).toHaveBeenCalledOnce();
			expect(deleteSelectedAnnotation).toHaveBeenCalledOnce();
			expect(toast).not.toHaveBeenCalled();
		});

		it("deletes annotation at exact span boundaries", () => {
			const atStart = setupLayer({
				targetType: "annotation",
				selectedId: "layer-1",
				regions,
				currentTimeMs: 1000,
			});
			atStart.press(key);
			expect(atStart.deleteSelectedAnnotation).toHaveBeenCalledOnce();

			const atEnd = setupLayer({
				targetType: "annotation",
				selectedId: "layer-1",
				regions,
				currentTimeMs: 3000,
			});
			atEnd.press(key);
			expect(atEnd.deleteSelectedAnnotation).toHaveBeenCalledOnce();
			expect(toast).not.toHaveBeenCalled();
		});

		it("does not delete annotation and shows toast when playhead is outside span", () => {
			const beforeSpan = setupLayer({
				targetType: "annotation",
				selectedId: "layer-1",
				regions,
				currentTimeMs: 999,
			});
			const eventBefore = beforeSpan.press(key);
			expect(eventBefore.preventDefault).toHaveBeenCalledOnce();
			expect(beforeSpan.deleteSelectedAnnotation).not.toHaveBeenCalled();
			expect(toast).toHaveBeenCalledWith(
				"Move the playhead onto the layer to delete it, or use the Delete button in its settings.",
			);

			vi.clearAllMocks();

			const afterSpan = setupLayer({
				targetType: "annotation",
				selectedId: "layer-1",
				regions,
				currentTimeMs: 3001,
			});
			const eventAfter = afterSpan.press(key);
			expect(eventAfter.preventDefault).toHaveBeenCalledOnce();
			expect(afterSpan.deleteSelectedAnnotation).not.toHaveBeenCalled();
			expect(toast).toHaveBeenCalledWith(
				"Move the playhead onto the layer to delete it, or use the Delete button in its settings.",
			);
		});

		it("deletes audio region when playhead is inside its span", () => {
			const { press, deleteSelectedAudio } = setupLayer({
				targetType: "audio",
				selectedId: "layer-1",
				regions,
				currentTimeMs: 2000,
			});
			const event = press(key);
			expect(event.preventDefault).toHaveBeenCalledOnce();
			expect(deleteSelectedAudio).toHaveBeenCalledOnce();
			expect(toast).not.toHaveBeenCalled();
		});

		it("does not delete audio region and shows toast when playhead is outside span", () => {
			const { press, deleteSelectedAudio } = setupLayer({
				targetType: "audio",
				selectedId: "layer-1",
				regions,
				currentTimeMs: 500,
			});
			const event = press(key);
			expect(event.preventDefault).toHaveBeenCalledOnce();
			expect(deleteSelectedAudio).not.toHaveBeenCalled();
			expect(toast).toHaveBeenCalledWith(
				"Move the playhead onto the layer to delete it, or use the Delete button in its settings.",
			);
		});

		it("deletes caption when playhead is inside its span", () => {
			const { press, deleteSelectedCaption } = setupLayer({
				targetType: "caption",
				selectedId: "layer-1",
				regions,
				currentTimeMs: 2500,
			});
			const event = press(key);
			expect(event.preventDefault).toHaveBeenCalledOnce();
			expect(deleteSelectedCaption).toHaveBeenCalledOnce();
			expect(toast).not.toHaveBeenCalled();
		});

		it("does not delete caption and shows toast when playhead is outside span", () => {
			const { press, deleteSelectedCaption } = setupLayer({
				targetType: "caption",
				selectedId: "layer-1",
				regions,
				currentTimeMs: 4000,
			});
			const event = press(key);
			expect(event.preventDefault).toHaveBeenCalledOnce();
			expect(deleteSelectedCaption).not.toHaveBeenCalled();
			expect(toast).toHaveBeenCalledWith(
				"Move the playhead onto the layer to delete it, or use the Delete button in its settings.",
			);
		});
	});
});
