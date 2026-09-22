import {
	Gear,
	House,
	UserCircle,
	Palette,
	Translate,
	TerminalWindow,
	Folder,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { type ComponentProps, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { useI18n } from "@/contexts/I18nContext";
import type { useEditorUiState } from "../state/useEditorUiState";
import type { useProjectState } from "../state/useProjectState";
import type { useEditorProjectController } from "../project/useEditorProjectController";
import type { EditorEffectSection } from "../types";
import { SettingsPanel } from "../SettingsPanel";
import EditorDashboard from "./EditorDashboard";
import { EditorDialogs } from "./EditorDialogs";
import { Toaster } from "@/components/ui/sonner";
import { EditorAnnouncementBanner } from "@/components/announcements/EditorAnnouncementBanner";

type DashboardSidebarProps = {
	t: ReturnType<typeof useI18n>["t"];
	activeSection: EditorEffectSection;
	setActiveSection: (section: EditorEffectSection) => void;
	settingsPanelProps: ComponentProps<typeof SettingsPanel>;
	onImportFile: () => void;
	onRecordScreen: () => void;
};

function DashboardSidebar({
	t,
	activeSection,
	setActiveSection,
	settingsPanelProps,
	onImportFile,
	onRecordScreen,
}: DashboardSidebarProps) {
	const { user, openAuthModal, signOut } = useAuth();
	const sections = useMemo(
		() => [
			{ id: "dashboard" as const, label: t("settings.sections.dashboard", "Home"), icon: House },
			{ id: "projects" as const, label: t("settings.sections.projects", "Projects"), icon: Folder },
			{ id: "brandkit" as const, label: t("settings.sections.brandkit", "Brand kit"), icon: Palette },
			{ id: "translation" as const, label: t("settings.sections.translation", "Translation"), icon: Translate },
			{ id: "mcp" as const, label: t("settings.sections.mcp", "MCP"), icon: TerminalWindow },
			{
				id: "settings" as const,
				label: t("settings.sections.settings", "Settings"),
				icon: Gear,
			},
		],
		[t],
	);

	return (
		<div className="flex flex-shrink-0 gap-1.5 h-full">
			<div className="flex flex-shrink-0 flex-col items-center gap-0.5 px-2 py-2">
				{sections.map((section) => {
					const isActive = activeSection === section.id;
					return (
						<div key={section.id} className="flex items-center">
							<motion.button
								type="button"
								onClick={() => setActiveSection(section.id)}
								title={section.label}
								className="group relative flex h-9 w-9 items-center justify-center rounded-lg outline-none focus:outline-none focus-visible:outline-none"
								animate={{ opacity: isActive ? 1 : 0.55 }}
								transition={{ duration: 0.14 }}
							>
								{isActive ? (
									<motion.span
										layoutId="dashboard-rail-active-bg"
										className="absolute inset-0 rounded-lg bg-foreground/[0.08]"
										transition={{ type: "spring", stiffness: 450, damping: 35 }}
									/>
								) : null}
								<motion.span
									className="relative z-10"
									animate={{
										color: isActive ? "#2563EB" : "hsl(var(--foreground))",
									}}
									transition={{ duration: 0.14 }}
								>
									<section.icon
										className="h-[27px] w-[27px]"
										weight={isActive ? "fill" : "regular"}
									/>
								</motion.span>
							</motion.button>
							<div className="ml-1.5 h-1.5 w-1.5 flex-shrink-0">
								{isActive ? (
									<motion.span
										layoutId="dashboard-rail-active-dot"
										className="block h-1.5 w-1.5 rounded-full bg-[#2563EB]"
										initial={{ opacity: 0, scale: 0.5 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.5 }}
										transition={{ type: "spring", stiffness: 500, damping: 32 }}
									/>
								) : null}
							</div>
						</div>
					);
				})}
				<div className="mt-auto flex flex-col items-center gap-0.5 pt-3">
					{user ? (
						<Popover>
							<PopoverTrigger asChild>
								<motion.button
									type="button"
									title={t("editor.account.title", "Account")}
									className="group relative flex h-9 w-9 items-center justify-center rounded-lg text-foreground outline-none transition focus:outline-none focus-visible:outline-none"
									whileHover={{ opacity: 1 }}
									initial={{ opacity: 0.9 }}
								>
									<motion.span className="absolute inset-0 rounded-lg bg-foreground/[0.04] opacity-0 transition group-hover:opacity-100" />
									<UserCircle className="relative z-10 h-[22px] w-[22px]" weight="fill" />
								</motion.button>
							</PopoverTrigger>
							<PopoverContent className="w-56 bg-editor-dialog p-2 border-foreground/10 text-foreground" side="right" align="end">
								<div className="flex flex-col gap-2">
									<div className="px-2 py-1.5 text-sm font-medium opacity-80 truncate">
										{user.email}
									</div>
									<div className="h-px bg-foreground/10 my-1" />
									<button
										onClick={() => signOut()}
										className="w-full text-left px-2 py-1.5 text-sm rounded-md text-red-500 hover:bg-red-500/10 transition-colors"
									>
										Sign out
									</button>
								</div>
							</PopoverContent>
						</Popover>
					) : (
						<motion.button
							type="button"
							onClick={openAuthModal}
							title={t("editor.account.title", "Account")}
							className="group relative flex h-9 w-9 items-center justify-center rounded-lg text-foreground/55 outline-none transition hover:text-foreground focus:outline-none focus-visible:outline-none"
							whileHover={{ opacity: 1 }}
							initial={{ opacity: 0.55 }}
						>
							<motion.span className="absolute inset-0 rounded-lg bg-foreground/[0.04] opacity-0 transition group-hover:opacity-100" />
							<UserCircle className="relative z-10 h-[22px] w-[22px]" />
						</motion.button>
					)}
				</div>
			</div>
			{activeSection === "settings" ? (
				<SettingsPanel
					{...settingsPanelProps}
					onImportFile={onImportFile}
					onRecordScreen={onRecordScreen}
				/>
			) : null}
		</div>
	);
}

function ComingSoonPlaceholder({ title }: { title: string }) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center text-foreground/50">
			<h2 className="text-xl font-medium text-foreground">{title}</h2>
			<p className="mt-2 text-sm">Coming soon</p>
		</div>
	);
}

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	project: ReturnType<typeof useProjectState>;
	ui: ReturnType<typeof useEditorUiState>;
	projectController: ReturnType<typeof useEditorProjectController>;
	settingsPanelProps: ComponentProps<typeof SettingsPanel>;
};

export function DashboardLayout({
	t,
	project,
	ui,
	projectController,
	settingsPanelProps,
}: Props) {
	const { openActions, saveActions, lifecycle, recordingActions } = projectController;
	const { activeEffectSection, setActiveEffectSection } = ui;

	// Ensure we only have valid dashboard sections
	const safeActiveSection = ["dashboard", "projects", "brandkit", "translation", "mcp", "settings"].includes(activeEffectSection)
		? activeEffectSection
		: "dashboard";

	const editorDialogs = (
		<EditorDialogs
			t={t}
			projectSaveDialogOpen={project.projectSaveDialogOpen}
			setProjectSaveDialogOpen={project.setProjectSaveDialogOpen}
			projectSaveDialogDraft={project.projectSaveDialogDraft}
			setProjectSaveDialogDraft={project.setProjectSaveDialogDraft}
			projectSaveDialogInputRef={ui.projectSaveDialogInputRef}
			isSavingProjectDialog={project.isSavingProjectDialog}
			resolveProjectSaveDialog={lifecycle.resolveProjectSaveDialog}
			handleProjectSaveDialogSubmit={saveActions.handleProjectSaveDialogSubmit}
			unsavedChangesDialogOpen={project.unsavedChangesDialogOpen}
			setUnsavedChangesDialogOpen={project.setUnsavedChangesDialogOpen}
			unsavedChangesDialogActionLabel={project.unsavedChangesDialogActionLabel}
			resolveUnsavedChangesDialog={lifecycle.resolveUnsavedChangesDialog}
			projectBrowserOpen={project.projectBrowserOpen}
			setProjectBrowserOpen={project.setProjectBrowserOpen}
			projectLibraryEntries={project.projectLibraryEntries}
			projectBrowserAnchorRef={
				project.error ? ui.projectBrowserFallbackTriggerRef : ui.projectBrowserTriggerRef
			}
			handleImportMediaOrProject={openActions.handleImportMediaOrProject}
			handleOpenProjectFromLibrary={openActions.handleOpenProjectFromLibrary}
			nativeCaptureUnavailableModalOpen={ui.nativeCaptureUnavailableModalOpen}
			setNativeCaptureUnavailableModalOpen={ui.setNativeCaptureUnavailableModalOpen}
		/>
	);

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-editor-bg text-foreground selection:bg-[#2563EB]/30">
			<EditorAnnouncementBanner />
			<div className="relative flex min-h-0 flex-1 flex-row gap-3 p-4">
				<DashboardSidebar
					t={t}
					activeSection={safeActiveSection}
					setActiveSection={setActiveEffectSection}
					settingsPanelProps={settingsPanelProps}
					onImportFile={openActions.handleImportMediaOrProject}
					onRecordScreen={recordingActions.openLauncher}
				/>
				<div className="flex-1 overflow-hidden rounded-xl border border-foreground/10 bg-editor-panel shadow-[0_4px_24px_rgba(0,0,0,0.1)]">
					{safeActiveSection === "dashboard" || safeActiveSection === "projects" ? (
						<EditorDashboard
							mode={safeActiveSection}
							entries={project.projectLibraryEntries}
							onOpenProject={openActions.handleOpenProjectFromLibrary}
							onNewProject={openActions.handleCreateNewProject}
							onRecordScreen={recordingActions.openLauncher}
						/>
					) : safeActiveSection === "brandkit" ? (
						<ComingSoonPlaceholder title="Brand kit" />
					) : safeActiveSection === "translation" ? (
						<ComingSoonPlaceholder title="Translation" />
					) : safeActiveSection === "mcp" ? (
						<ComingSoonPlaceholder title="Model Context Protocol" />
					) : null}
				</div>
			</div>
			{editorDialogs}
			<Toaster className="pointer-events-auto" />
		</div>
	);
}
