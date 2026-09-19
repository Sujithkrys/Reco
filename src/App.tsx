import { Suspense } from "react";
import EditorWindow from "./components/video-editor/EditorWindow";

export default function App() {
	return (
		<Suspense fallback={null}>
			<EditorWindow />
		</Suspense>
	);
}
