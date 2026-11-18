-- Editing imported questions (administrator) and change suggestions from members, AnkiHub style:
-- a member picks the kind of change and explains it (up to 500 characters); the administrator reviews,
-- edits the question if needed and accepts or rejects. Members see what happened to their suggestions.

-- Administrator: rename a set and/or fix its questions. The number of questions and of alternatives per
-- question stays the same, so answers already given (stored by position) keep pointing to the same thing.
create or replace function public.question_set_update(p_id uuid,p_title text,p_questions jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.question_sets; v_title text; i integer;
begin
 if auth.uid() is null or not public.is_peleja_admin() then raise exception 'Acesso negado';end if;
 select * into s from public.question_sets where id=p_id for update;
 if s.id is null then raise exception 'Conjunto não encontrado';end if;
 p_questions:=coalesce(p_questions,s.questions);
 v_title:=private.question_set_checked_title(coalesce(p_title,s.title),s.source_url,p_questions,s.fingerprint);
 if jsonb_array_length(p_questions)<>s.question_count then raise exception 'A quantidade de questões não pode mudar';end if;
 for i in 0..s.question_count-1 loop
  if jsonb_array_length(p_questions->i->'answerOptions')<>jsonb_array_length(s.questions->i->'answerOptions') then raise exception 'Questão %: a quantidade de alternativas não pode mudar',i+1;end if;
 end loop;
 update public.question_sets set title=v_title,questions=p_questions where id=p_id;
end;$$;

create table if not exists public.question_suggestions (
 id uuid primary key default gen_random_uuid(),
 set_id uuid not null references public.question_sets(id) on delete cascade,
 question_index integer not null check(question_index>=0),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check(kind in ('content','answer','explanation','wording','spelling','outdated','other')),
 note text not null check(length(note) between 1 and 500),
 status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists question_suggestions_status_idx on public.question_suggestions(status,created_at desc);
create index if not exists question_suggestions_user_idx on public.question_suggestions(user_id,created_at desc);
alter table public.question_suggestions enable row level security;
revoke all on public.question_suggestions from public,anon,authenticated;

create or replace function public.question_suggestion_submit(p_set uuid,p_index integer,p_kind text,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_count integer; result uuid;
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 select question_count into v_count from public.question_sets where id=p_set;
 if v_count is null then raise exception 'Conjunto não encontrado';end if;
 if p_index is null or p_index<0 or p_index>=v_count then raise exception 'Questão não encontrada';end if;
 p_note:=btrim(coalesce(p_note,''));
 if length(p_note) not between 1 and 500 then raise exception 'Explique a mudança em até 500 caracteres';end if;
 if (select count(*) from public.question_suggestions where user_id=auth.uid() and status='pending')>=50 then raise exception 'Muitas sugestões em análise. Aguarde a revisão';end if;
 insert into public.question_suggestions(set_id,question_index,kind,note) values(p_set,p_index,p_kind,p_note) returning id into result;
 return result;
end;$$;

-- The member's own suggestions and their outcome.
create or replace function public.question_suggestions_mine() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'setId',g.set_id,'setTitle',s.title,'index',g.question_index,'kind',g.kind,'note',g.note,'status',g.status,'createdAt',g.created_at,'reviewedAt',g.reviewed_at) order by g.created_at desc),'[]'::jsonb)
  from public.question_suggestions g join public.question_sets s on s.id=g.set_id where g.user_id=auth.uid());
end;$$;

-- Administrator: suggestions to review (or the history), with the question they point to and who sent them.
create or replace function public.question_suggestions_review_list(p_status text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_peleja_admin() then raise exception 'Acesso negado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'setId',g.set_id,'setTitle',s.title,'index',g.question_index,'question',s.questions->g.question_index,
   'kind',g.kind,'note',g.note,'status',g.status,'createdAt',g.created_at,'reviewedAt',g.reviewed_at,'author',coalesce(p.display_name,h.username,'Membro')) order by g.created_at),'[]'::jsonb)
  from public.question_suggestions g join public.question_sets s on s.id=g.set_id
  left join public.profiles p on p.id=g.user_id left join public.account_handles h on h.user_id=g.user_id
  where p_status is null or g.status=p_status);
end;$$;

create or replace function public.question_suggestion_review(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_peleja_admin() then raise exception 'Acesso negado';end if;
 update public.question_suggestions set status=case when p_accept then 'accepted' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_id and status='pending';
 if not found then raise exception 'Sugestão não encontrada ou já revisada';end if;
end;$$;

revoke all on function public.question_set_update(uuid,text,jsonb),public.question_suggestion_submit(uuid,integer,text,text),public.question_suggestions_mine(),public.question_suggestions_review_list(text),public.question_suggestion_review(uuid,boolean) from public,anon;
grant execute on function public.question_set_update(uuid,text,jsonb),public.question_suggestion_submit(uuid,integer,text,text),public.question_suggestions_mine(),public.question_suggestions_review_list(text),public.question_suggestion_review(uuid,boolean) to authenticated;
