import {
	Gear,
	UserCircle,
	Palette,
	Translate,
	TerminalWindow,
	Folder,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
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
	
	const menuGroups: { id: EditorEffectSection; label: string; icon: Icon; isNew?: boolean }[][] =
		useMemo(
		() => [
			[
				{ id: "projects" as const, label: t("settings.sections.projects", "Projects"), icon: Folder },
			],
			[
				{ id: "brandkit" as const, label: t("settings.sections.brandkit", "Brand kit"), icon: Palette },
				{ id: "translation" as const, label: t("settings.sections.translation", "Translation"), icon: Translate },
			],
			[
				{ id: "mcp" as const, label: t("settings.sections.mcp", "MCP"), icon: TerminalWindow, isNew: true },
			]
		],
		[t],
	);

	return (
		<div className="flex flex-shrink-0 w-60 h-full flex-col bg-editor-bg border-r border-foreground/5 pr-4 pl-2 py-4">
			<div className="flex items-center gap-2 px-3 mb-6">
				<div className="flex h-7 w-7 items-center justify-center rounded bg-pink-500 text-white">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
					</svg>
				</div>
				<span className="text-xl font-bold tracking-tight text-foreground">Reco</span>
			</div>
			
			<div className="flex flex-1 flex-col gap-4 overflow-y-auto mt-2">
				{menuGroups.map((group, groupIndex) => (
					<div key={groupIndex} className="flex flex-col gap-1">
						{groupIndex > 0 && <div className="h-px bg-foreground/10 border-t border-dashed border-transparent my-1 mx-3" />}
						{group.map((section) => {
							const isActive = activeSection === section.id;
							return (
								<button
									key={section.id}
									type="button"
									onClick={() => setActiveSection(section.id)}
									className={`group flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors ${
										isActive 
											? "bg-foreground/10 text-foreground" 
											: "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
									}`}
								>
									<section.icon 
										className={`h-[18px] w-[18px] ${isActive ? "text-foreground" : "text-foreground/60 group-hover:text-foreground/80"}`} 
										weight={isActive ? "fill" : "regular"} 
									/>
									<span>{section.label}</span>
									{section.isNew && (
										<span className="ml-auto rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
											New
										</span>
									)}
								</button>
							);
						})}
					</div>
				))}
			</div>

			<div className="mt-auto flex flex-col gap-1 pt-4">
				<div className="h-px bg-foreground/10 border-t border-dashed border-transparent my-1 mx-3" />
				<button
					type="button"
					onClick={() => setActiveSection("settings" as EditorEffectSection)}
					className={`group flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors ${
						activeSection === "settings"
							? "bg-foreground/10 text-foreground" 
							: "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
					}`}
				>
					<Gear 
						className={`h-[18px] w-[18px] ${activeSection === "settings" ? "text-foreground" : "text-foreground/60 group-hover:text-foreground/80"}`} 
						weight={activeSection === "settings" ? "fill" : "regular"} 
					/>
					<span>{t("settings.sections.settings", "Settings")}</span>
				</button>

				{user ? (
					<Popover>
						<PopoverTrigger asChild>
							<button className="group flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors text-foreground/70 hover:bg-foreground/5 hover:text-foreground">
								<UserCircle className="h-[18px] w-[18px] text-foreground/60 group-hover:text-foreground/80" weight="regular" />
								<span className="truncate">{user.email?.split('@')[0] || "Account"}</span>
							</button>
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
					<button
						onClick={openAuthModal}
						className="group flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
					>
						<UserCircle className="h-[18px] w-[18px] text-foreground/60 group-hover:text-foreground/80" weight="regular" />
						<span>Account</span>
					</button>
				)}
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

	// "Projects" is the landing section; legacy "dashboard" ids fall through to it.
	const safeActiveSection = ["projects", "brandkit", "translation", "mcp", "settings"].includes(
		activeEffectSection,
	)
		? activeEffectSection
		: "projects";

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
					{safeActiveSection === "projects" ? (
						<EditorDashboard
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
