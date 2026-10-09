import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipContextType {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	triggerRef: React.RefObject<HTMLElement | null>;
	contentId: string;
	side: "top" | "bottom" | "left" | "right";
	align: "start" | "center" | "end";
	sideOffset: number;
}

const TooltipContext = createContext<TooltipContextType | null>(null);

export interface TooltipProps {
	content?: React.ReactNode;
	children: React.ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
	sideOffset?: number;
	delayMs?: number;
	className?: string;
	disabled?: boolean;
	asChild?: boolean;
}

export function Tooltip({
	content,
	children,
	side = "top",
	align = "center",
	sideOffset = 6,
	delayMs = 250,
	className,
	disabled = false,
	asChild = false,
}: TooltipProps) {
	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLElement | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const contentId = useId();

	const open = useCallback(() => {
		if (disabled || !content) return;
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			setIsOpen(true);
		}, delayMs);
	}, [delayMs, disabled, content]);

	const close = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setIsOpen(false);
	}, []);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	// Position calculation for portal
	const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

	const updatePosition = useCallback(() => {
		if (!triggerRef.current) return;
		const rect = triggerRef.current.getBoundingClientRect();

		let top = 0;
		let left = 0;

		if (side === "top") {
			top = rect.top - sideOffset;
		} else if (side === "bottom") {
			top = rect.bottom + sideOffset;
		} else if (side === "left") {
			left = rect.left - sideOffset;
			top = rect.top + rect.height / 2;
		} else if (side === "right") {
			left = rect.right + sideOffset;
			top = rect.top + rect.height / 2;
		}

		if (side === "top" || side === "bottom") {
			if (align === "start") {
				left = rect.left;
			} else if (align === "end") {
				left = rect.right;
			} else {
				left = rect.left + rect.width / 2;
			}
		}

		setCoords({ top, left });
	}, [side, align, sideOffset]);

	useEffect(() => {
		if (isOpen) {
			updatePosition();
			window.addEventListener("scroll", updatePosition, true);
			window.addEventListener("resize", updatePosition);
			return () => {
				window.removeEventListener("scroll", updatePosition, true);
				window.removeEventListener("resize", updatePosition);
			};
		}
	}, [isOpen, updatePosition]);

	const contextValue: TooltipContextType = {
		isOpen,
		open,
		close,
		triggerRef,
		contentId,
		side,
		align,
		sideOffset,
	};

	if (!content) {
		return <>{children}</>;
	}

	const transformClass =
		side === "top"
			? align === "start"
				? "-translate-y-full"
				: align === "end"
					? "-translate-x-full -translate-y-full"
					: "-translate-x-1/2 -translate-y-full"
			: side === "bottom"
				? align === "start"
					? ""
					: align === "end"
						? "-translate-x-full"
						: "-translate-x-1/2"
				: side === "left"
					? "-translate-x-full -translate-y-1/2"
					: "-translate-y-1/2";

	const portalContent =
		isOpen &&
		coords &&
		createPortal(
			<div
				id={contentId}
				role="tooltip"
				style={{
					position: "fixed",
					top: `${coords.top}px`,
					left: `${coords.left}px`,
					zIndex: 99999,
				}}
				className={cn(
					"pointer-events-none select-none rounded-md px-2 py-1 text-[11px] font-medium leading-none shadow-lg transition-opacity duration-150",
					"bg-neutral-900/95 text-neutral-100 border border-neutral-700/60 dark:bg-neutral-800/95 dark:text-neutral-200 dark:border-neutral-600/50 backdrop-blur-md",
					transformClass,
					className,
				)}
			>
				{content}
			</div>,
			document.body,
		);

	if (asChild && React.isValidElement(children)) {
		const child = children as React.ReactElement<any>;
		return (
			<TooltipContext.Provider value={contextValue}>
				{React.cloneElement(child, {
					ref: (node: HTMLElement | null) => {
						(triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
						const childRef = (child as any).ref;
						if (typeof childRef === "function") {
							childRef(node);
						} else if (childRef && typeof childRef === "object" && "current" in childRef) {
							childRef.current = node;
						}
					},
					onMouseEnter: (e: React.MouseEvent) => {
						child.props.onMouseEnter?.(e);
						open();
					},
					onMouseLeave: (e: React.MouseEvent) => {
						child.props.onMouseLeave?.(e);
						close();
					},
					onFocus: (e: React.FocusEvent) => {
						child.props.onFocus?.(e);
						open();
					},
					onBlur: (e: React.FocusEvent) => {
						child.props.onBlur?.(e);
						close();
					},
					onClick: (e: React.MouseEvent) => {
						child.props.onClick?.(e);
						close();
					},
					"aria-describedby": isOpen ? contentId : undefined,
				})}
				{portalContent}
			</TooltipContext.Provider>
		);
	}

	return (
		<TooltipContext.Provider value={contextValue}>
			<span
				ref={triggerRef as React.RefObject<HTMLSpanElement>}
				onMouseEnter={open}
				onMouseLeave={close}
				onFocus={open}
				onBlur={close}
				onClick={close}
				className="inline-flex items-center"
				aria-describedby={isOpen ? contentId : undefined}
			>
				{children}
			</span>
			{portalContent}
		</TooltipContext.Provider>
	);
}

// Compound API for flexible composition if needed
export function TooltipProvider({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}

export function TooltipTrigger({
	children,
	asChild: _asChild,
	...props
}: React.HTMLAttributes<HTMLElement> & { asChild?: boolean }) {
	const ctx = useContext(TooltipContext);
	return (
		<span
			ref={ctx?.triggerRef as React.RefObject<HTMLSpanElement>}
			onMouseEnter={ctx?.open}
			onMouseLeave={ctx?.close}
			onFocus={ctx?.open}
			onBlur={ctx?.close}
			onClick={ctx?.close}
			{...props}
		>
			{children}
		</span>
	);
}

export function TooltipContent({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const ctx = useContext(TooltipContext);
	if (!ctx?.isOpen) return null;
	return (
		<div className={cn("z-50 rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md", className)}>
			{children}
		</div>
	);
}
