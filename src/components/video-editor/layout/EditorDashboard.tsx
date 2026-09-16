import { toFileUrl } from "../projectPersistence";
import type { ProjectLibraryEntry } from "../ProjectBrowserDialog";

type EditorDashboardProps = {
	entries: ProjectLibraryEntry[];
	onOpenProject: (projectPath: string) => void;
	onImportFile: () => void;
};

export default function EditorDashboard({
	entries,
	onOpenProject,
	onImportFile,
}: EditorDashboardProps) {
	// Show up to 12 most recent projects
	const recentProjects = entries.slice(0, 12);

	return (
		<div className="relative flex h-screen w-full flex-col bg-background text-foreground overflow-y-auto">
			{/* Glassmorphism gradient background */}
			<div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-background to-background"></div>

			<div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-12 md:px-12 md:py-24">
				<header className="mb-12 flex flex-col items-center justify-center text-center">
					<div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[24px] bg-foreground/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] ring-1 ring-white/10 backdrop-blur-md">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="36"
							height="36"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="text-foreground/80"
						>
							<polygon points="23 7 16 12 23 17 23 7" />
							<rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
						</svg>
					</div>
					<h1 className="mb-3 text-4xl font-bold tracking-tight">Welcome to Reco</h1>
					<p className="max-w-[400px] text-lg text-foreground/60">
						Create beautiful product demos, tutorials, and walkthroughs in your browser.
					</p>
					
					<button
						type="button"
						onClick={onImportFile}
						className="mt-8 group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_40px_rgba(37,99,235,0.4)] transition-all hover:bg-blue-500 hover:shadow-[0_0_60px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
					>
						<span className="absolute inset-0 h-full w-full bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						Import Video
					</button>
				</header>

				{recentProjects.length > 0 && (
					<section className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
						<div className="mb-6 flex items-center justify-between">
							<h2 className="text-xl font-semibold tracking-tight">Recent Projects</h2>
						</div>

						<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:gap-6">
							{recentProjects.map((entry) => {
								const thumbnailSrc = entry.thumbnailPath
									? toFileUrl(entry.thumbnailPath)
									: null;
								return (
									<button
										key={entry.path}
										type="button"
										onClick={() => onOpenProject(entry.path)}
										className="group flex flex-col gap-3 rounded-xl bg-transparent p-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500"
									>
										<div className="relative aspect-[16/10] w-full overflow-hidden rounded-[10px] bg-foreground/5 shadow-sm ring-1 ring-foreground/10 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:ring-foreground/20">
											{thumbnailSrc ? (
												<img
													src={thumbnailSrc}
													alt=""
													className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
													draggable={false}
												/>
											) : (
												<div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(180deg,_rgba(37,99,235,0.1),_rgba(13,17,23,0.4))] text-foreground/40 transition-colors group-hover:text-foreground/60">
													<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
														<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
														<polyline points="14 2 14 8 20 8"/>
													</svg>
													<span className="text-[11px] font-medium uppercase tracking-wider">Project</span>
												</div>
											)}
										</div>
										<div className="flex flex-col px-1">
											<div className="truncate text-sm font-semibold tracking-tight text-foreground/90 transition-colors group-hover:text-foreground">
												{entry.name}
											</div>
											<div className="text-xs text-foreground/50">
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
				)}
			</div>
		</div>
	);
}
