import type { RowDefinition } from "dnd-timeline";
import { useRow } from "dnd-timeline";

interface RowProps extends RowDefinition {
	children: React.ReactNode;
	label?: string;
	hint?: string;
	isEmpty?: boolean;
	isThin?: boolean;
	labelColor?: string;
	onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
	onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
	onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
	onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
	onClick?: React.MouseEventHandler<HTMLDivElement>;
}

export default function Row({
	id,
	children,
	label,
	hint,
	isEmpty,
	isThin,
	labelColor = "#666",
	onMouseEnter,
	onMouseMove,
	onMouseLeave,
	onMouseDown,
	onClick,
}: RowProps) {
	const { setNodeRef, rowWrapperStyle, rowStyle } = useRow({ id });

	return (
		<div
			className={`bg-transparent relative transition-all duration-200 ${
				isThin ? 'h-1.5 hover:min-h-[26px] flex-none' : 'flex-1 min-h-[26px]'
			}`}
			style={{ ...rowWrapperStyle, marginBottom: 2 }}
		>
			{label && !isThin && (
				<div
					className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-widest z-20 pointer-events-none select-none"
					style={{ color: labelColor, writingMode: "horizontal-tb" }}
				>
					{label}
				</div>
			)}
			{isEmpty && hint && !isThin && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
					<span className="text-[11px] text-foreground/15 font-medium">{hint}</span>
				</div>
			)}
			<div
				ref={setNodeRef}
				className={`relative h-full overflow-hidden ${isThin ? '' : 'min-h-[26px]'}`}
				style={rowStyle}
				onMouseEnter={onMouseEnter}
				onMouseMove={onMouseMove}
				onMouseLeave={onMouseLeave}
				onMouseDown={onMouseDown}
				onClick={onClick}
			>
				{children}
			</div>
		</div>
	);
}
