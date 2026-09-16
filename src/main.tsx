import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { I18nProvider } from "./contexts/I18nContext.tsx";
import { ThemeProvider } from "./contexts/ThemeContext.tsx";
import "./index.css";

document.documentElement.dataset.platform = /mac/i.test(navigator.platform) ? "macos" : "other";

if (typeof window !== "undefined" && !(window as any).electronAPI) {
	(window as any).electronAPI = new Proxy({}, {
		get(_target, prop) {
			if (prop === "getProjectLibrary") return async () => ({ success: true, library: [] });
			if (prop === "openVideoFilePicker") return async () => {
				return new Promise((resolve) => {
					const input = document.createElement("input");
					input.type = "file";
					input.accept = "video/*";
					input.onchange = (e) => {
						const file = (e.target as HTMLInputElement).files?.[0];
						if (!file) {
							resolve({ canceled: true });
							return;
						}
						resolve({ success: true, path: URL.createObjectURL(file), kind: "media" });
					};
					input.click();
				});
			};
			if (typeof prop === "string" && prop.startsWith("on")) {
				return () => () => {};
			}
			return async () => ({});
		}
	});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<ThemeProvider>
			<I18nProvider>
				<App />
			</I18nProvider>
		</ThemeProvider>
	</React.StrictMode>,
);
