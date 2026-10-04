import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Plus,
	CaretDown,
	VideoCamera,
	FileVideo,
	FilePlus,
	DotsThree,
	PencilSimple,
	Trash,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { toFileUrl } from "../projectPersistence";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";

/**
 * Thumbnails are stored as `data:` URLs in web mode; only real filesystem
 * paths need converting to file:// URLs.
 */
function resolveThumbnailSrc(thumbnailPath: string): string {
	return /^(data:|blob:|https?:)/i.test(thumbnailPath)
		? thumbnailPath
		: toFileUrl(thumbnailPath);
}

type EditorDashboardProps = {
	entries: ProjectLibraryEntry[];
	onOpenProject: (projectPath: string) => void;
	onNewProject: (postAction?: "upload" | "record") => Promise<string | null>;
	onRecordScreen: () => void;
	onDeleteProject: (projectPath: string) => Promise<boolean>;
	onRenameProject: (projectPath: string, newName: string) => Promise<boolean>;
};

export default function EditorDashboard({
	entries,
	onOpenProject,
	onNewProject,
	onRecordScreen,
	onDeleteProject,
	onRenameProject,
}: EditorDashboardProps) {
	const displayProjects = entries;
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [renameDraft, setRenameDraft] = useState("");
	const [deleteTarget, setDeleteTarget] = useState<ProjectLibraryEntry | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const renameInputRef = useRef<HTMLInputElement>(null);

	const startRename = (entry: ProjectLibraryEntry) => {
		setRenamingPath(entry.path);
		setRenameDraft(entry.name);
		requestAnimationFrame(() => {
			renameInputRef.current?.focus();
			renameInputRef.current?.select();
		});
	};

	const commitRename = async (path: string) => {
		const trimmed = renameDraft.trim();
		setRenamingPath(null);
		if (!trimmed) return;
		const ok = await onRenameProject(path, trimmed);
		if (!ok) toast.error("Failed to rename project");
	};

	const confirmDelete = async () => {
		if (!deleteTarget) return;
		setIsDeleting(true);
		try {
			await onDeleteProject(deleteTarget.path);
			setDeleteTarget(null);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<div className="flex h-full w-full flex-col overflow-y-auto bg-editor-panel text-foreground">
			<div className="flex flex-col gap-6 p-5">
				<header className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-2xl font-bold tracking-tight">Projects</h2>
							<p className="text-sm text-foreground/60">
								Start a new project or open a saved one.
							</p>
						</div>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
								>
									<Plus weight="bold" />
									New project
									<CaretDown weight="bold" className="ml-1 opacity-70" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56 bg-editor-dialog border-foreground/10 text-foreground p-1">
								<DropdownMenuItem
									onClick={() => onNewProject()}
									className="flex items-center gap-2 cursor-pointer focus:bg-foreground/10"
								>
									<FilePlus className="h-4 w-4" />
									<span>Start blank project</span>
								</DropdownMenuItem>

								<DropdownMenuItem
									onClick={async () => {
										const path = await onNewProject();
										if (path) {
											onRecordScreen();
										}
									}}
									className="flex items-center gap-2 cursor-pointer focus:bg-foreground/10"
								>
									<VideoCamera className="h-4 w-4" />
									<span>Record screen</span>
								</DropdownMenuItem>

								<DropdownMenuItem
									onClick={() => onNewProject("upload")}
									className="flex items-center gap-2 cursor-pointer focus:bg-foreground/10"
								>
									<FileVideo className="h-4 w-4" />
									<span>Upload video</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</header>

				{displayProjects.length > 0 ? (
					<section className="flex flex-col gap-3">
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
							{displayProjects.map((entry) => {
								const thumbnailSrc = entry.thumbnailPath
									? resolveThumbnailSrc(entry.thumbnailPath)
									: null;
								const isRenaming = renamingPath === entry.path;
								return (
									// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation handled via onKeyDown below
									<div
										key={entry.path}
										role="button"
										tabIndex={0}
										onClick={() => {
											if (!isRenaming) onOpenProject(entry.path);
										}}
										onKeyDown={(event) => {
											if (isRenaming) return;
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												onOpenProject(entry.path);
											}
										}}
										className="group relative flex flex-col gap-3 rounded-xl border border-transparent bg-foreground/[0.02] p-3 text-left outline-none transition hover:bg-foreground/[0.06] hover:border-foreground/10 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
									>
										<div className="absolute right-4 top-4 z-10">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														onClick={(event) => event.stopPropagation()}
														className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/70 group-hover:opacity-100 focus-visible:opacity-100"
														title="Project options"
													>
														<DotsThree weight="bold" className="h-4 w-4" />
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent
													align="end"
													className="w-40 bg-editor-dialog border-foreground/10 text-foreground p-1"
													onClick={(event) => event.stopPropagation()}
												>
													<DropdownMenuItem
														onClick={() => startRename(entry)}
														className="flex items-center gap-2 cursor-pointer focus:bg-foreground/10"
													>
														<PencilSimple className="h-4 w-4" />
														<span>Rename</span>
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => setDeleteTarget(entry)}
														className="flex items-center gap-2 cursor-pointer text-red-500 focus:bg-red-500/10 focus:text-red-500"
													>
														<Trash className="h-4 w-4" />
														<span>Delete</span>
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
										<div className="relative aspect-[16/10] w-full flex-shrink-0 overflow-hidden rounded-lg bg-foreground/5 shadow-sm ring-1 ring-foreground/10 transition group-hover:shadow-md">
											{thumbnailSrc ? (
												<img
													src={thumbnailSrc}
													alt=""
													className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
													draggable={false}
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,_rgba(37,99,235,0.1),_rgba(13,17,23,0.4))] text-foreground/40 transition-colors group-hover:text-foreground/60">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
														<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
														<polyline points="14 2 14 8 20 8"/>
													</svg>
												</div>
											)}
										</div>
										<div className="flex min-w-0 flex-col">
											{isRenaming ? (
												<input
													ref={renameInputRef}
													type="text"
													value={renameDraft}
													onChange={(event) => setRenameDraft(event.target.value)}
													onClick={(event) => event.stopPropagation()}
													onBlur={() => void commitRename(entry.path)}
													onKeyDown={(event) => {
														event.stopPropagation();
														if (event.key === "Enter") {
															event.preventDefault();
															void commitRename(entry.path);
														} else if (event.key === "Escape") {
															event.preventDefault();
															setRenamingPath(null);
														}
													}}
													className="truncate rounded-md border border-blue-500 bg-editor-bg px-1.5 py-0.5 text-sm font-semibold tracking-tight text-foreground/90 outline-none"
												/>
											) : (
												<div className="truncate text-sm font-semibold tracking-tight text-foreground/90 transition-colors group-hover:text-foreground">
													{entry.name}
												</div>
											)}
											<div className="truncate text-xs text-foreground/50">
												{new Date(entry.updatedAt).toLocaleDateString(undefined, {
													month: 'short',
													day: 'numeric',
													year: new Date(entry.updatedAt).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
												})}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</section>
				) : (
					<section className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-foreground/10 bg-editor-bg p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] mt-4">
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5 text-foreground/40">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
								<polyline points="14 2 14 8 20 8"/>
							</svg>
						</div>
						<div className="text-xs font-medium text-foreground/60">
							No saved projects yet
						</div>
					</section>
				)}
			</div>
			<Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete project?</DialogTitle>
						<DialogDescription>
							{deleteTarget
								? `"${deleteTarget.name}" will be permanently deleted. This can't be undone.`
								: null}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<button
							type="button"
							onClick={() => setDeleteTarget(null)}
							disabled={isDeleting}
							className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground/70 hover:bg-foreground/10 disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={() => void confirmDelete()}
							disabled={isDeleting}
							className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
						>
							{isDeleting ? "Deleting..." : "Delete"}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
