-- Pomodoro: each finished (or stopped) focus block of a member. Feeds the focus profile, Insights
-- and the hours ranking. Blocks are written by the timer on the device; the id comes from the client
-- so retrying after a network failure never duplicates a block.
create table if not exists public.pomodoro_blocks (
 id uuid primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 task text not null default '' check(length(task)<=80),
 started_at timestamptz not null,
 ended_at timestamptz not null,
 focus_ms integer not null check(focus_ms between 60000 and 21600000),
 planned_ms integer not null check(planned_ms between 0 and 21600000),
 flow_extra_ms integer not null default 0 check(flow_extra_ms between 0 and 21600000),
 created_at timestamptz not null default now(),
 check(ended_at>started_at),
 check(focus_ms<=extract(epoch from (ended_at-started_at))*1000+5000)
);
create index if not exists pomodoro_blocks_user_idx on public.pomodoro_blocks(user_id,started_at desc);
create index if not exists pomodoro_blocks_time_idx on public.pomodoro_blocks(started_at desc);
alter table public.pomodoro_blocks enable row level security;
revoke all on public.pomodoro_blocks from public,anon,authenticated;

create or replace function public.pomodoro_block_save(p_id uuid,p_task text,p_started timestamptz,p_ended timestamptz,p_focus_ms integer,p_planned_ms integer,p_flow_extra_ms integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 if p_ended>now()+interval '2 minutes' or p_started<now()-interval '14 days' then raise exception 'Horário do bloco inválido';end if;
 insert into public.pomodoro_blocks(id,task,started_at,ended_at,focus_ms,planned_ms,flow_extra_ms)
 values(p_id,left(btrim(coalesce(p_task,'')),80),p_started,p_ended,p_focus_ms,coalesce(p_planned_ms,0),greatest(coalesce(p_flow_extra_ms,0),0))
 on conflict(id) do nothing;
end;$$;

-- The member's own blocks since a moment (profile, Insights).
create or replace function public.pomodoro_blocks_mine(p_from timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'task',task,'startedAt',started_at,'endedAt',ended_at,'focusMs',focus_ms,'plannedMs',planned_ms,'flowExtraMs',flow_extra_ms) order by started_at desc),'[]')
  from public.pomodoro_blocks where user_id=auth.uid() and started_at>=coalesce(p_from,'-infinity'::timestamptz));
end;$$;

create or replace function public.pomodoro_block_delete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 delete from public.pomodoro_blocks where id=p_id and user_id=auth.uid();
end;$$;

revoke all on function public.pomodoro_block_save(uuid,text,timestamptz,timestamptz,integer,integer,integer),public.pomodoro_blocks_mine(timestamptz),public.pomodoro_block_delete(uuid) from public,anon;
grant execute on function public.pomodoro_block_save(uuid,text,timestamptz,timestamptz,integer,integer,integer),public.pomodoro_blocks_mine(timestamptz),public.pomodoro_block_delete(uuid) to authenticated;
