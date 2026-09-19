/// <reference types="vite/client" />

interface CursorTelemetryPoint {
	x: number;
	y: number;
	t: number;
}
interface ProcessedDesktopSource {
	id: string;
	name: string;
	thumbnail: string;
}
interface RendererExportHardwareInfo {
	gpu?: string;
}

declare global {
	interface Window {
		electronAPI: any;
		isElectron?: boolean;
	}
}
