-- Leftovers of the first Peleja (root app, removed): nothing in next/ calls these.
drop function if exists public.focus_create(text,integer,uuid);
drop function if exists public.focus_act(uuid,integer,text);
drop function if exists public.focus_state();
drop table if exists public.focus_sessions;
drop function if exists public.export_own_attempts();
drop function if exists public.restore_personal_backup(jsonb,bigint,bigint);
drop function if exists public.save_simulation_attempt(text,text,jsonb,jsonb,integer,jsonb,text,uuid);
drop function if exists public.study_progress(date);
