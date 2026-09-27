function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export const env = {
	supabaseUrl: requireEnv("SUPABASE_URL"),
	// Service-role key: bypasses RLS, so this process can write clips/upload
	// videos on behalf of any project. Never expose this to a browser client
	// (that's what Reco's existing VITE_SUPABASE_PUBLISHABLE_KEY is for) —
	// this server is the only thing that should ever hold it.
	supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
	renderServiceUrl:
		process.env.RENDER_SERVICE_URL ?? "https://remo-clone-production.up.railway.app",
	motionGraphicsBucket: process.env.MOTION_GRAPHICS_BUCKET ?? "motion-graphics",
};
