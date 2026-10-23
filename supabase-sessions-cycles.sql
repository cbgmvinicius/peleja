-- Existing sessions retain their original timer behavior. New timed sessions use cycles.
begin;
alter table public.focus_sessions add column if not exists cycles_enabled boolean not null default false;
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

revoke all on function public.focus_create(text,integer,uuid) from public,anon;
grant execute on function public.focus_create(text,integer,uuid) to authenticated;
commit;
