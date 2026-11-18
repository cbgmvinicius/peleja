-- How each member appears in the rankings: with name and photo (default), as "Anônimo", or not at all.
-- The Pomodoro ranking applies it on the server; the Painel comparison and the Ranking page read the
-- list below and apply it before drawing (a member always sees their own row).
create table if not exists public.ranking_privacy (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 mode text not null check(mode in ('visible','anonymous','hidden')),
 updated_at timestamptz not null default now()
);
alter table public.ranking_privacy enable row level security;
revoke all on public.ranking_privacy from public,anon,authenticated;

create or replace function public.ranking_privacy_set(p_mode text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 if p_mode is null or p_mode not in ('visible','anonymous','hidden') then raise exception 'Opção inválida';end if;
 if p_mode='visible' then delete from public.ranking_privacy where user_id=auth.uid();return;end if;
 insert into public.ranking_privacy(user_id,mode,updated_at) values(auth.uid(),p_mode,now())
 on conflict(user_id) do update set mode=excluded.mode,updated_at=now();
end;$$;

-- Members who chose to be anonymous or hidden (everyone else is visible).
create or replace function public.ranking_privacy_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'mode',mode)),'[]'::jsonb) from public.ranking_privacy);
end;$$;

-- Pomodoro ranking with privacy: hidden members neither show up for others nor see them; anonymous ones get a neutral id and name.
create or replace function public.pomodoro_ranking(p_from timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 if p_from is null or p_from<now()-interval '400 days' then raise exception 'Período inválido';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
   'userId',case when m.anon then 'anon-'||left(md5(m.user_id::text||'peleja'),10) else m.user_id::text end,
   'name',case when m.anon then 'Anônimo' else m.name end,'anonymous',m.anon,'hidden',coalesce(pr.mode,'')='hidden',
   'me',m.user_id=auth.uid(),'totalMs',coalesce(t.total,0),'sessions',coalesce(t.n,0),
   'live',case when l.user_id is null then null else jsonb_build_object('mode',l.mode,'running',l.running,'since',l.since,'accMs',l.acc_ms,'phaseStartedAt',l.phase_started_at) end
  ) order by coalesce(t.total,0) desc,m.name),'[]'::jsonb)
  from (select h.user_id,coalesce(p.display_name,h.username) as name,(coalesce(r.mode,'')='anonymous' and h.user_id<>auth.uid()) as anon
        from public.account_handles h left join public.profiles p on p.id=h.user_id left join public.ranking_privacy r on r.user_id=h.user_id
        where h.active and (coalesce(r.mode,'')<>'hidden' or h.user_id=auth.uid())
          -- whoever chose not to take part sees only their own row
          and (h.user_id=auth.uid() or not exists(select 1 from public.ranking_privacy me where me.user_id=auth.uid() and me.mode='hidden'))) m
  left join public.ranking_privacy pr on pr.user_id=m.user_id
  left join (select user_id,sum(focus_ms)::bigint total,count(*) n from public.pomodoro_blocks where started_at>=p_from group by user_id) t on t.user_id=m.user_id
  left join public.pomodoro_live l on l.user_id=m.user_id and l.updated_at>now()-interval '3 minutes');
end;$$;

revoke all on function public.ranking_privacy_set(text),public.ranking_privacy_list(),public.pomodoro_ranking(timestamptz) from public,anon;
grant execute on function public.ranking_privacy_set(text),public.ranking_privacy_list(),public.pomodoro_ranking(timestamptz) to authenticated;
