import { describe, expect, it } from "vitest";
import { decideTextClick, TAP_MOVE_TOLERANCE_PX, type TextClickInput } from "./textClickDecision";

const base: TextClickInput = { movedPx: 0, isSelected: false, isEditing: false, justLeftEditing: false };
const decide = (over: Partial<TextClickInput>) => decideTextClick({ ...base, ...over });

describe("decideTextClick", () => {
	it("a tap on an unselected layer only selects it", () => {
		expect(decide({})).toBe("select");
		expect(decide({ movedPx: TAP_MOVE_TOLERANCE_PX })).toBe("select");
	});

	it("a tap on an already selected layer enters edit mode", () => {
		expect(decide({ isSelected: true })).toBe("edit");
	});

	it("a drag does nothing but move, whether or not the layer was selected", () => {
		expect(decide({ movedPx: TAP_MOVE_TOLERANCE_PX + 0.1 })).toBe("ignore");
		expect(decide({ movedPx: 30, isSelected: true })).toBe("ignore");
	});

	it("clicks while editing are left to the caret", () => {
		expect(decide({ isSelected: true, isEditing: true })).toBe("ignore");
	});

	it("after leaving edit mode, the next tap only selects", () => {
		expect(decide({ isSelected: true, justLeftEditing: true })).toBe("select");
	});
});
