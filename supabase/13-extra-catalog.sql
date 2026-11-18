-- Shared course suggestions. Private drafts; publication requires an administrator.
create table if not exists public.extra_course_submissions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 100),
 modules jsonb not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
alter table public.extra_course_submissions enable row level security;
revoke all on public.extra_course_submissions from public,anon,authenticated;
create or replace function public.extra_course_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id','course-'||id::text,'title',title,'modules',modules,'status',status,'mine',owner_id=auth.uid()) order by created_at),'[]') from public.extra_course_submissions where status='approved' or owner_id=auth.uid() or public.is_peleja_admin());
end;$$;
create or replace function public.submit_extra_course(p_title text,p_modules jsonb) returns text language plpgsql security definer set search_path='' as $$
declare result uuid; m jsonb; l jsonb; normalized jsonb:='[]'; lessons jsonb; mi integer:=0; li integer:=0; total integer:=0; link text;
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 if p_title is null or length(trim(p_title)) not between 1 and 100 then raise exception 'Informe o nome do curso';end if;
 if jsonb_typeof(p_modules) is distinct from 'array' then raise exception 'Módulos inválidos';end if;
 if jsonb_array_length(p_modules) not between 1 and 80 then raise exception 'Use de 1 a 80 módulos';end if;
 -- Serialize submissions by owner so the pending limit cannot be bypassed concurrently.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from public.extra_course_submissions where owner_id=auth.uid() and status='pending')>=5 then raise exception 'Aguarde a revisão das suas sugestões pendentes';end if;
 for m in select value from jsonb_array_elements(p_modules) loop
  if length(trim(coalesce(m->>'title',''))) not between 1 and 120 or jsonb_typeof(m->'lessons') is distinct from 'array' then raise exception 'Confira os módulos';end if;
  if jsonb_array_length(m->'lessons')<1 then raise exception 'Cada módulo precisa de uma aula';end if;
  mi:=mi+1;li:=0;lessons:='[]';
  for l in select value from jsonb_array_elements(m->'lessons') loop
   if length(trim(coalesce(l->>'title',''))) not between 1 and 200 then raise exception 'Confira os nomes das aulas';end if;
   link:=trim(coalesce(l->>'url',''));
   if length(link)>2000 or (link<>'' and link!~'^https://[A-Za-z0-9][A-Za-z0-9.-]+(/|$)') then raise exception 'Use links HTTPS válidos';end if;
   li:=li+1;total:=total+1;if total>1000 then raise exception 'Limite de 1000 aulas por curso';end if;
   lessons:=lessons||jsonb_build_array(jsonb_build_object('id','m'||mi||'-l'||li,'title',trim(l->>'title'),'url',link));
  end loop;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('id','m'||mi,'title',trim(m->>'title'),'lessons',lessons));
 end loop;
 insert into public.extra_course_submissions(owner_id,title,modules) values(auth.uid(),trim(p_title),normalized) returning id into result;
 return 'course-'||result::text;
end;$$;
create or replace function public.review_extra_course(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_peleja_admin() then raise exception 'Acesso negado';end if;
 if p_approve is null then raise exception 'Decisão obrigatória';end if;
 update public.extra_course_submissions set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now() where id=p_id and status='pending';
 if not found then raise exception 'Esta sugestão já foi revisada';end if;
end;$$;
revoke all on function public.extra_course_catalog(),public.submit_extra_course(text,jsonb),public.review_extra_course(uuid,boolean) from public,anon;
grant execute on function public.extra_course_catalog(),public.submit_extra_course(text,jsonb),public.review_extra_course(uuid,boolean) to authenticated;
