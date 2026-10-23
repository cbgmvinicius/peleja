-- Focus sessions are independent from academic workspaces and private to participants.
begin;
create table if not exists public.focus_sessions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 peer_id uuid references auth.users(id),
 title text not null check(length(title) between 1 and 160),
 planned_minutes integer not null default 25 check(planned_minutes between 0 and 240),
 status text not null check(status in ('invited','running','paused','ended','declined')),
 elapsed_ms bigint not null default 0 check(elapsed_ms>=0),
 running_since timestamptz,
 created_at timestamptz not null default now(),
 ended_at timestamptz,
 pending_action text check(pending_action in ('pause','resume','end')),
 pending_by uuid references auth.users(id),
 version integer not null default 1,
 check(peer_id is null or peer_id<>owner_id),
 check((status='running')=(running_since is not null)),
 check((pending_action is null)=(pending_by is null)),
 check(pending_by is null or pending_by=owner_id or pending_by=peer_id)
);
alter table public.focus_sessions add column if not exists cycles_enabled boolean not null default false;
create index if not exists focus_owner_recent on public.focus_sessions(owner_id,created_at desc);
create index if not exists focus_peer_recent on public.focus_sessions(peer_id,created_at desc) where peer_id is not null;
alter table public.focus_sessions enable row level security;
revoke all on public.focus_sessions from public,anon,authenticated;
grant select on public.focus_sessions to authenticated;
drop policy if exists focus_participants on public.focus_sessions;
create policy focus_participants on public.focus_sessions for select to authenticated
 using(public.has_peleja_access() and ((select auth.uid())=owner_id or (select auth.uid())=peer_id));

create or replace function public.focus_state() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 select jsonb_build_object('user_id',u,'server_now',clock_timestamp(),
 'sessions',coalesce((select jsonb_agg(to_jsonb(s) order by created_at desc) from
   (select * from public.focus_sessions where owner_id=u or peer_id=u order by created_at desc limit 100) s),'[]'::jsonb),
 'peers',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'name',username) order by username)
 from public.account_handles where active and user_id<>u),'[]'::jsonb)) into result;
 return result;
end;$$;

create or replace function public.focus_create(p_title text,p_minutes integer,p_peer uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();lock_id uuid;
begin
 if u is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 if p_peer=u or (p_peer is not null and not exists(select 1 from public.account_handles where user_id=p_peer and active)) then raise exception 'Participante indisponível';end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 160 or p_minutes is null or p_minutes not between 0 and 240 then raise exception 'Confira o assunto e a duração';end if;
 -- Same ordered locks across crossed invitations, preventing two active sessions per person.
 for lock_id in select x from unnest(array[u,p_peer]) x where x is not null order by x loop
  perform pg_advisory_xact_lock(hashtextextended(lock_id::text,714));
 end loop;
 if exists(select 1 from public.focus_sessions where status in ('invited','running','paused') and (owner_id=u or peer_id=u or owner_id=p_peer or peer_id=p_peer)) then raise exception 'Um dos participantes já tem uma sessão ou convite aberto';end if;
 insert into public.focus_sessions(owner_id,peer_id,title,planned_minutes,cycles_enabled,status,running_since)
 values(u,p_peer,btrim(p_title),p_minutes,p_minutes>0,case when p_peer is null then 'running' else 'invited' end,case when p_peer is null then clock_timestamp() end);
 return public.focus_state();
end;$$;

create or replace function public.focus_act(p_id uuid,p_version integer,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s public.focus_sessions;action text;t timestamptz:=clock_timestamp();
begin
 if u is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 select * into s from public.focus_sessions where id=p_id for update;
 t:=clock_timestamp();
 if not found or (u<>s.owner_id and u is distinct from s.peer_id) then raise exception 'Sessão indisponível';end if;
 if s.version<>p_version then raise exception 'A sessão mudou. Atualize e tente novamente';end if;
 if s.status in ('ended','declined') then raise exception 'Sessão já encerrada';end if;
 if s.status='invited' then
  if p_action='accept' and u=s.peer_id then
   s.status:='running';s.running_since:=t;
  elsif p_action='decline' then s.status:='declined';s.ended_at:=t;
  else raise exception 'Confirme ou recuse o convite';end if;
 elsif p_action in ('cancel','reject') then
  if s.pending_action is null then raise exception 'Não há pedido pendente';end if;
  if (p_action='cancel' and u<>s.pending_by) or (p_action='reject' and u=s.pending_by) then raise exception 'Ação indisponível';end if;
  s.pending_action:=null;s.pending_by:=null;
 else
  if p_action='confirm' then
   if s.pending_action is null or u=s.pending_by then raise exception 'O outro participante precisa confirmar';end if;
   action:=s.pending_action;
  elsif p_action in ('pause','resume','end') then
   if s.pending_action is not null then raise exception 'Já existe um pedido pendente';end if;
   action:=p_action;
  else raise exception 'Ação inválida';end if;
  if (action='pause' and s.status<>'running') or (action='resume' and s.status<>'paused') then raise exception 'Ação incompatível com o estado atual';end if;
  if s.peer_id is not null and p_action<>'confirm' then
   s.pending_action:=action;s.pending_by:=u;
  else
   if s.status='running' then s.elapsed_ms:=s.elapsed_ms+greatest(0,floor(extract(epoch from (t-s.running_since))*1000)::bigint);end if;
   s.status:=case action when 'pause' then 'paused' when 'resume' then 'running' else 'ended' end;
   s.running_since:=case when action='resume' then t end;
   if action='end' then s.ended_at:=t;end if;
   s.pending_action:=null;s.pending_by:=null;
  end if;
 end if;
 update public.focus_sessions set status=s.status,running_since=s.running_since,elapsed_ms=s.elapsed_ms,
 ended_at=s.ended_at,pending_action=s.pending_action,pending_by=s.pending_by,version=s.version+1 where id=s.id;
 return public.focus_state();
end;$$;
revoke all on function public.focus_state(),public.focus_create(text,integer,uuid),public.focus_act(uuid,integer,text) from public,anon;
grant execute on function public.focus_state(),public.focus_create(text,integer,uuid),public.focus_act(uuid,integer,text) to authenticated;
commit;
