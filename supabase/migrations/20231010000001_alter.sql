-- Add new columns and constraints to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- We can only set NOT NULL on user_id if there's no existing data, or we delete it.
-- Since this is an initial fix for a development DB, let's just make it NOT NULL directly,
-- but if we have existing test rows, we'd need to clear them or provide a default.
DELETE FROM projects WHERE user_id IS NULL;
ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE projects
  RENAME COLUMN thumbnail_path TO thumbnail_url;

ALTER TABLE projects
  RENAME COLUMN data TO editor_state;

-- Create presets table
CREATE TABLE IF NOT EXISTS presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  settings JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE presets ENABLE ROW LEVEL SECURITY;

-- Policies for projects
CREATE POLICY "Users can select their own projects"
  ON projects
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
  ON projects
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON projects
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for presets
CREATE POLICY "Users can select their own presets"
  ON presets
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own presets"
  ON presets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own presets"
  ON presets
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own presets"
  ON presets
  FOR DELETE
  USING (auth.uid() = user_id);
