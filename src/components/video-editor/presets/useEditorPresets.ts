import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
	type EditorPreset,
	type EditorPresetSnapshot,
	type TemplateAnnotationRegion,
	saveEditorPresets,
	serializeEditorPresetSnapshot,
} from "../editorPreferences";
import { DEFAULT_ANNOTATION_POSITION, DEFAULT_ANNOTATION_SIZE, DEFAULT_ANNOTATION_STYLE } from "../types";

export interface SavePresetOptions {
	/** Include layers, zoom keyframes and clip structure — not just visual style. */
	captureFullStructure?: boolean;
	/** Only meaningful with captureFullStructure: add editable intro/outro text placeholders. */
	includeIntroOutroPlaceholders?: boolean;
}

function buildIntroOutroPlaceholders(): TemplateAnnotationRegion[] {
	const placeholderDurationMs = 3000;
	const base = {
		position: { ...DEFAULT_ANNOTATION_POSITION },
		size: { ...DEFAULT_ANNOTATION_SIZE },
		style: { ...DEFAULT_ANNOTATION_STYLE },
		zIndex: 9000,
		type: "text" as const,
	};
	return [
		{
			...base,
			id: `template-intro-${crypto.randomUUID()}`,
			anchor: { reference: "start", offsetMs: 0 },
			durationMs: placeholderDurationMs,
			content: "Add your intro here",
			textContent: "Add your intro here",
		},
		{
			...base,
			id: `template-outro-${crypto.randomUUID()}`,
			anchor: { reference: "end", offsetMs: -placeholderDurationMs },
			durationMs: placeholderDurationMs,
			content: "Add your outro here",
			textContent: "Add your outro here",
		},
	];
}

type Translator = (
	key: string,
	fallback?: string,
	params?: Record<string, string | number>,
) => string;

interface UseEditorPresetsParams {
	t: Translator;
	currentSnapshot: EditorPresetSnapshot;
	applySnapshot: (snapshot: EditorPresetSnapshot) => void;
	editorPresets: EditorPreset[];
	setEditorPresets: Dispatch<SetStateAction<EditorPreset[]>>;
	activePresetId: string | null;
	setActivePresetId: Dispatch<SetStateAction<string | null>>;
	presetPopoverOpen: boolean;
	presetNameDraft: string;
	setPresetNameDraft: Dispatch<SetStateAction<string>>;
}

export function useEditorPresets({
	t,
	currentSnapshot,
	applySnapshot,
	editorPresets,
	setEditorPresets,
	activePresetId,
	setActivePresetId,
	presetPopoverOpen,
	presetNameDraft,
	setPresetNameDraft,
}: UseEditorPresetsParams) {
	const currentSignature = useMemo(
		() => serializeEditorPresetSnapshot(currentSnapshot),
		[currentSnapshot],
	);
	const currentEditorPreset = useMemo(
		() => editorPresets.find((preset) => preset.id === activePresetId) ?? null,
		[activePresetId, editorPresets],
	);

	useEffect(() => {
		if (
			currentEditorPreset &&
			serializeEditorPresetSnapshot(currentEditorPreset.snapshot) === currentSignature
		) {
			return;
		}

		const matchingPreset =
			editorPresets.find(
				(preset) => serializeEditorPresetSnapshot(preset.snapshot) === currentSignature,
			) ?? null;
		const nextActiveId = matchingPreset?.id ?? null;
		if (nextActiveId !== activePresetId) setActivePresetId(nextActiveId);
	}, [activePresetId, currentEditorPreset, currentSignature, editorPresets, setActivePresetId]);

	useEffect(() => {
		if (!presetPopoverOpen) setPresetNameDraft("");
	}, [presetPopoverOpen, setPresetNameDraft]);

	const handleApplyEditorPreset = useCallback(
		(presetId: string) => {
			const preset = editorPresets.find((item) => item.id === presetId);
			if (!preset) return;
			setActivePresetId(preset.id);
			applySnapshot(preset.snapshot);
			toast.success(
				t("editor.presets.toasts.applied", 'Applied preset "{{name}}"', {
					name: preset.name,
				}),
			);
		},
		[applySnapshot, editorPresets, setActivePresetId, t],
	);

	const handleSaveEditorPreset = useCallback(
		(name: string, options?: SavePresetOptions) => {
			const normalizedName = name.trim().replace(/\s+/g, " ");
			if (!normalizedName) {
				toast.error(t("editor.presets.errors.nameRequired", "Enter a preset name."));
				return false;
			}
			if (
				editorPresets.some(
					(preset) =>
						preset.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
				)
			) {
				toast.error(
					t(
						"editor.presets.errors.duplicateName",
						"A preset with that name already exists.",
					),
				);
				return false;
			}

			const captureFullStructure = options?.captureFullStructure ?? false;
			const snapshot: EditorPresetSnapshot = captureFullStructure
				? {
						...currentSnapshot,
						templateAnnotations: options?.includeIntroOutroPlaceholders
							? [...currentSnapshot.templateAnnotations, ...buildIntroOutroPlaceholders()]
							: currentSnapshot.templateAnnotations,
					}
				: {
						...currentSnapshot,
						templateClips: [],
						templateZooms: [],
						templateAnnotations: [],
						templateAudios: [],
						_excludedMidTimelineElements: 0,
						_excludedCustomAssets: 0,
					};

			const timestamp = new Date().toISOString();
			const nextPreset: EditorPreset = {
				id: crypto.randomUUID(),
				name: normalizedName,
				createdAt: timestamp,
				updatedAt: timestamp,
				snapshot,
			};
			const nextPresets = [nextPreset, ...editorPresets];
			if (!saveEditorPresets(nextPresets)) {
				toast.error(
					t(
						"editor.presets.errors.saveFailed",
						"Could not save that preset. Check your browser storage settings and try again.",
					),
				);
				return false;
			}
			setEditorPresets(nextPresets);
			setActivePresetId(nextPreset.id);

			const excludedMid = snapshot._excludedMidTimelineElements ?? 0;
			const excludedAssets = snapshot._excludedCustomAssets ?? 0;
			
			if (excludedMid > 0 || excludedAssets > 0) {
				const parts = [];
				if (excludedMid > 0) parts.push(`${excludedMid} mid-timeline element${excludedMid === 1 ? "" : "s"}`);
				if (excludedAssets > 0) parts.push(`${excludedAssets} custom asset${excludedAssets === 1 ? "" : "s"}`);
				toast.warning(
					t("editor.presets.toasts.savedWithExclusions", `Template saved. ${parts.join(" and ")} were not included — only start/end content and styling are captured.`, {
						name: normalizedName,
					}),
					{ duration: 5000 }
				);
			} else {
				toast.success(
					t("editor.presets.toasts.saved", 'Saved preset "{{name}}"', {
						name: normalizedName,
					}),
				);
			}

			return true;
		},
		[currentSnapshot, editorPresets, setActivePresetId, setEditorPresets, t],
	);

	const handleDeleteEditorPreset = useCallback(
		(presetId: string) => {
			const preset = editorPresets.find((item) => item.id === presetId);
			if (!preset) return;
			const nextPresets = editorPresets.filter((item) => item.id !== presetId);
			if (!saveEditorPresets(nextPresets)) {
				toast.error(
					t(
						"editor.presets.errors.deleteFailed",
						"Could not delete that preset. Check your browser storage settings and try again.",
					),
				);
				return;
			}
			setEditorPresets(nextPresets);
			if (preset.id === activePresetId) setActivePresetId(null);
			toast.success(
				t("editor.presets.toasts.deleted", 'Deleted preset "{{name}}"', {
					name: preset.name,
				}),
			);
		},
		[activePresetId, editorPresets, setActivePresetId, setEditorPresets, t],
	);

	const handleSavePresetSubmit = useCallback(
		(options?: SavePresetOptions) => {
			if (handleSaveEditorPreset(presetNameDraft, options)) setPresetNameDraft("");
		},
		[handleSaveEditorPreset, presetNameDraft, setPresetNameDraft],
	);

	return {
		currentEditorPreset,
		handleApplyEditorPreset,
		handleDeleteEditorPreset,
		handleSavePresetSubmit,
	};
}
