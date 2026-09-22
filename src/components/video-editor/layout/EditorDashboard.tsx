import { Plus } from "@phosphor-icons/react";
import { toFileUrl } from "../projectPersistence";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";

type EditorDashboardProps = {
	entries: ProjectLibraryEntry[];
	onOpenProject: (projectPath: string) => void;
	onNewProject: () => void;
};

export default function EditorDashboard({
	entries,
	onOpenProject,
	onNewProject,
}: EditorDashboardProps) {
	// Show up to 12 most recent projects
	const recentProjects = entries.slice(0, 12);

	return (
		<div className="flex h-full w-full flex-col overflow-y-auto bg-editor-panel text-foreground">
			<div className="flex flex-col gap-6 p-5">
				<header className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
							<p className="text-sm text-foreground/60">
								Start a new project or open an existing one.
							</p>
						</div>
						<button 
							type="button"
							onClick={onNewProject} 
							className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
						>
							<Plus weight="bold" />
							New Recording
						</button>
					</div>
				</header>

				{recentProjects.length > 0 ? (
					<section className="flex flex-col gap-3">
						<h3 className="text-sm font-medium tracking-tight text-foreground/80">
							Recent Projects
						</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
							{recentProjects.map((entry) => {
								const thumbnailSrc = entry.thumbnailPath
									? toFileUrl(entry.thumbnailPath)
									: null;
								return (
									<button
										key={entry.path}
										type="button"
										onClick={() => onOpenProject(entry.path)}
										className="group flex flex-col gap-3 rounded-xl border border-transparent bg-foreground/[0.02] p-3 text-left outline-none transition hover:bg-foreground/[0.06] hover:border-foreground/10 focus-visible:ring-2 focus-visible:ring-blue-500"
									>
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
											<div className="truncate text-sm font-semibold tracking-tight text-foreground/90 transition-colors group-hover:text-foreground">
												{entry.name}
											</div>
											<div className="truncate text-xs text-foreground/50">
												{new Date(entry.updatedAt).toLocaleDateString(undefined, { 
													month: 'short', 
													day: 'numeric',
													year: new Date(entry.updatedAt).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
												})}
											</div>
										</div>
									</button>
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
		</div>
	);
}
