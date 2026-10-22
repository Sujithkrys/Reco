/** A press that moves farther than this is a drag, not a tap. */
export const TAP_MOVE_TOLERANCE_PX = 4;

export type TextClickAction = "ignore" | "select" | "edit";

export interface TextClickInput {
	/** Distance in px between where the pointer went down and where it came up. */
	movedPx: number;
	/** The layer was already selected when the click happened. */
	isSelected: boolean;
	isEditing: boolean;
	/** Editing just ended (Esc, or a click outside): the next click only selects. */
	justLeftEditing: boolean;
}

/**
 * What a click on a text layer does. A drag never selects or edits (it moves the layer). A tap on
 * an unselected layer only selects it; a tap on a selected one enters edit mode, unless editing
 * was just left, in which case it only selects. While editing, clicks place the caret themselves.
 */
export function decideTextClick(input: TextClickInput): TextClickAction {
	if (input.movedPx > TAP_MOVE_TOLERANCE_PX) return "ignore";
	if (input.isEditing) return "ignore";
	if (!input.isSelected || input.justLeftEditing) return "select";
	return "edit";
}
