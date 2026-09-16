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
			if (typeof prop === "string" && prop.startsWith("on")) {
				return () => () => {};
			}
			return async () => null;
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
