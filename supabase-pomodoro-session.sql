-- Pomodoro session shared between devices: the timer of the session in progress (or idle), so a session
-- started or paused on the phone continues on the computer exactly where it stopped. One row per member.
-- changed_at is the moment of the last button press (the device's clock); the newest press wins.
create table if not exists public.pomodoro_session (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 state jsonb not null check(jsonb_typeof(state)='object' and octet_length(state::text)<=4000),
 changed_at timestamptz not null,
 updated_at timestamptz not null default now()
);
alter table public.pomodoro_session enable row level security;
revoke all on public.pomodoro_session from public,anon,authenticated;

-- The member's shared session, or null when there is none.
create or replace function public.pomodoro_session_get() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 return (select jsonb_build_object('state',state,'changedAt',changed_at) from public.pomodoro_session where user_id=auth.uid());
end;$$;

-- Stores the session when it is newer than the one kept. Returns null when stored; otherwise the newer
-- session already kept, which the device adopts instead.
create or replace function public.pomodoro_session_set(p_state jsonb,p_changed_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare kept public.pomodoro_session;
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 if p_changed_at is null or p_changed_at>now()+interval '5 minutes' or p_changed_at<now()-interval '2 days' then raise exception 'Horário inválido';end if;
 select * into kept from public.pomodoro_session where user_id=auth.uid() for update;
 if found and kept.changed_at>=p_changed_at then return jsonb_build_object('state',kept.state,'changedAt',kept.changed_at);end if;
 insert into public.pomodoro_session(state,changed_at) values(p_state,p_changed_at)
 on conflict(user_id) do update set state=excluded.state,changed_at=excluded.changed_at,updated_at=now();
 return null;
end;$$;

revoke all on function public.pomodoro_session_get(),public.pomodoro_session_set(jsonb,timestamptz) from public,anon;
grant execute on function public.pomodoro_session_get(),public.pomodoro_session_set(jsonb,timestamptz) to authenticated;
