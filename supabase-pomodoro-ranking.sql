-- Pomodoro ranking: focus hours per member over a period, plus who is studying right now.
-- The live row is written by the timer on each change and every minute while a session is on;
-- a row older than 3 minutes counts as gone (app closed, phone asleep).
create table if not exists public.pomodoro_live (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 mode text not null check(mode in ('focus','short','long')),
 running boolean not null,
 since timestamptz not null,
 acc_ms integer not null default 0 check(acc_ms between 0 and 21600000),
 phase_started_at timestamptz not null,
 updated_at timestamptz not null default now()
);
alter table public.pomodoro_live enable row level security;
revoke all on public.pomodoro_live from public,anon,authenticated;

-- p_mode null clears the member's live row (session ended or discarded).
create or replace function public.pomodoro_live_set(p_mode text,p_running boolean,p_since timestamptz,p_acc_ms integer,p_phase_started timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 if p_mode is null then delete from public.pomodoro_live where user_id=auth.uid();return;end if;
 if p_since>now()+interval '2 minutes' or p_since<now()-interval '1 day' or p_phase_started>now()+interval '2 minutes' or p_phase_started<now()-interval '1 day' then raise exception 'Horário inválido';end if;
 insert into public.pomodoro_live(user_id,mode,running,since,acc_ms,phase_started_at,updated_at)
 values(auth.uid(),p_mode,coalesce(p_running,false),p_since,greatest(coalesce(p_acc_ms,0),0),p_phase_started,now())
 on conflict(user_id) do update set mode=excluded.mode,running=excluded.running,since=excluded.since,acc_ms=excluded.acc_ms,phase_started_at=excluded.phase_started_at,updated_at=now();
end;$$;

-- Every active member with their focus total since p_from and their live state (if fresh).
create or replace function public.pomodoro_ranking(p_from timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 if p_from is null or p_from<now()-interval '400 days' then raise exception 'Período inválido';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
   'userId',m.user_id,'name',m.name,'me',m.user_id=auth.uid(),'totalMs',coalesce(t.total,0),'sessions',coalesce(t.n,0),
   'live',case when l.user_id is null then null else jsonb_build_object('mode',l.mode,'running',l.running,'since',l.since,'accMs',l.acc_ms,'phaseStartedAt',l.phase_started_at) end
  ) order by coalesce(t.total,0) desc,m.name),'[]'::jsonb)
  from (select h.user_id,coalesce(p.display_name,h.username) as name from public.account_handles h left join public.profiles p on p.id=h.user_id where h.active) m
  left join (select user_id,sum(focus_ms)::bigint total,count(*) n from public.pomodoro_blocks where started_at>=p_from group by user_id) t on t.user_id=m.user_id
  left join public.pomodoro_live l on l.user_id=m.user_id and l.updated_at>now()-interval '3 minutes');
end;$$;

revoke all on function public.pomodoro_live_set(text,boolean,timestamptz,integer,timestamptz),public.pomodoro_ranking(timestamptz) from public,anon;
grant execute on function public.pomodoro_live_set(text,boolean,timestamptz,integer,timestamptz),public.pomodoro_ranking(timestamptz) to authenticated;
