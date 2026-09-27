# Reco motion-graphics MCP server

Exposes two MCP tools backed by the [remo-clone](https://github.com/Sujithkrys/remo-clone)
render service:

- `create_motion_graphic(project_id, spec)` — renders a spec, uploads the
  result to Supabase Storage, and inserts a new row in `motion_graphic_clips`.
- `edit_motion_graphic(project_id, clip_id, spec)` — re-renders an existing
  clip with a full replacement spec and updates its row in place.

A "spec" is `{ scenes: [{ template, props }, ...], fps?, width?, height? }`.
The calling Claude session is expected to construct/modify the spec itself
(using the schema described in each tool's input schema) — these tools only
render, store, and persist; they don't do any spec authoring or editing logic
themselves.

## One-time setup

1. Apply the `motion_graphic_clips` migration
   (`supabase/migrations/20260927120000_add_motion_graphic_clips.sql`) against
   your Supabase project — via the SQL editor in the dashboard, or
   `supabase db push` if the project is CLI-linked.
2. In the Supabase dashboard, go to **Storage** and create a new bucket named
   `motion-graphics`, set to public (or adjust `storage.ts` to use signed URLs
   if you'd rather keep it private).
3. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` (same value as
   Reco's `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` (Supabase
   dashboard -> Settings -> API -> `service_role` secret — **never** put this
   in a `VITE_`-prefixed variable).

## Running

```sh
npm install
npm run dev   # or `npm start` for a one-shot run
```

This runs over stdio, so it's meant to be spawned by an MCP client, not run
standalone as a long-lived server. To connect it from Claude Code:

```sh
claude mcp add reco-motion-graphics -- npx tsx /absolute/path/to/mcp-server/src/index.ts
```
