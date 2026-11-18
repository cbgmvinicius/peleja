-- Existing profiles_update_own policy restricts edits to auth.uid().
grant update (display_name) on public.profiles to authenticated;
