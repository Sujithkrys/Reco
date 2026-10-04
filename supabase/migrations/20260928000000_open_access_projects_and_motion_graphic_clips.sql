-- Reco has no user accounts anymore (auth flow was removed), so the
-- per-user ownership model on these two tables is unreachable: auth.uid()
-- is always null, which would block all access, not just cross-user access.
-- Drop the ownership check and make these fully open, matching the rest of
-- the app (already no per-user isolation) and the public motion-graphics
-- storage bucket's existing trust model.

alter table public.projects alter column user_id drop not null;

drop policy if exists "Users can select their own projects" on public.projects;
drop policy if exists "Users can insert their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;

create policy "Open select on projects" on public.projects
  for select using (true);
create policy "Open insert on projects" on public.projects
  for insert with check (true);
create policy "Open update on projects" on public.projects
  for update using (true) with check (true);
create policy "Open delete on projects" on public.projects
  for delete using (true);

drop policy if exists "Users can select clips on their own projects" on public.motion_graphic_clips;
drop policy if exists "Users can insert clips on their own projects" on public.motion_graphic_clips;
drop policy if exists "Users can update clips on their own projects" on public.motion_graphic_clips;
drop policy if exists "Users can delete clips on their own projects" on public.motion_graphic_clips;

create policy "Open select on motion_graphic_clips" on public.motion_graphic_clips
  for select using (true);
create policy "Open insert on motion_graphic_clips" on public.motion_graphic_clips
  for insert with check (true);
create policy "Open update on motion_graphic_clips" on public.motion_graphic_clips
  for update using (true) with check (true);
create policy "Open delete on motion_graphic_clips" on public.motion_graphic_clips
  for delete using (true);
