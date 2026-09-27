-- Motion graphic clips: the first normalized "child" record under a project.
-- Each row is one AI-generated clip, storing the spec that produced it (the
-- source of truth for edits) alongside the rendered video's URL, so the
-- editor can show editable fields and re-render without regenerating the
-- spec from scratch.
CREATE TABLE motion_graphic_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  spec JSONB NOT NULL,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE motion_graphic_clips ENABLE ROW LEVEL SECURITY;

-- The MCP server writes through the service-role key (bypasses RLS), but
-- these policies are what let the Reco editor itself read/write clips
-- directly as the signed-in owner, same pattern as `projects`/`presets`.
CREATE POLICY "Users can select clips on their own projects"
  ON motion_graphic_clips
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = motion_graphic_clips.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert clips on their own projects"
  ON motion_graphic_clips
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = motion_graphic_clips.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update clips on their own projects"
  ON motion_graphic_clips
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = motion_graphic_clips.project_id
        AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = motion_graphic_clips.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete clips on their own projects"
  ON motion_graphic_clips
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = motion_graphic_clips.project_id
        AND projects.user_id = auth.uid()
    )
  );
