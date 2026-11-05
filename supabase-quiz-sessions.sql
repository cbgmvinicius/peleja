-- "Resolver questões": each member's sessions over an imported question set.
-- A session keeps its own layout (question order and shuffled options), the answers given so far
-- and the clock, so it can be resumed on any device. Scoring happens here, from the stored set.
create schema if not exists private;
create table if not exists public.quiz_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 set_id uuid not null references public.question_sets(id) on delete cascade,
 mode text not null check(mode in ('treino','prova')),
 clock text not null check(clock in ('stopwatch','timer')),
 timer_seconds integer check(timer_seconds is null or timer_seconds between 60 and 86400),
 layout jsonb not null,
 answers jsonb not null default '{}' check(jsonb_typeof(answers)='object'),
 elapsed_ms bigint not null default 0 check(elapsed_ms between 0 and 864000000),
 status text not null default 'active' check(status in ('active','done')),
 answered integer,
 correct integer,
 counted boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 finished_at timestamptz
);
create index if not exists quiz_sessions_owner_idx on public.quiz_sessions(user_id,set_id,created_at desc);
alter table public.quiz_sessions enable row level security;
revoke all on public.quiz_sessions from public,anon,authenticated;

-- layout: {"questions":[original question index...], "options":{"<question index>":[original option index...]}}
create or replace function private.quiz_layout_valid(p_layout jsonb,p_questions jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare n integer:=jsonb_array_length(p_questions); q jsonb; k integer; opts integer; perm jsonb;
begin
 if jsonb_typeof(p_layout->'questions')<>'array' or jsonb_typeof(p_layout->'options')<>'object' then return false;end if;
 if jsonb_array_length(p_layout->'questions') not between 1 and n then return false;end if;
 if (select count(distinct value) from jsonb_array_elements(p_layout->'questions'))<>jsonb_array_length(p_layout->'questions') then return false;end if;
 for q in select value from jsonb_array_elements(p_layout->'questions') loop
  if jsonb_typeof(q)<>'number' then return false;end if;k:=q::integer;if k<0 or k>=n then return false;end if;
  opts:=jsonb_array_length(p_questions->k->'answerOptions');perm:=p_layout->'options'->(k::text);
  if jsonb_typeof(perm)<>'array' or jsonb_array_length(perm)<>opts then return false;end if;
  if (select count(distinct value) from jsonb_array_elements(perm) where jsonb_typeof(value)='number' and value::integer between 0 and opts-1)<>opts then return false;end if;
 end loop;
 return true;
end;$$;

create or replace function public.quiz_session_start(p_set uuid,p_mode text,p_clock text,p_timer integer,p_layout jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_questions jsonb; result uuid;
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 select questions into v_questions from public.question_sets where id=p_set;
 if v_questions is null then raise exception 'Conjunto não encontrado';end if;
 if p_clock='timer' and p_timer is null then raise exception 'Informe o tempo do temporizador';end if;
 if not private.quiz_layout_valid(p_layout,v_questions) then raise exception 'Ordem das questões inválida';end if;
 -- One open session per set: starting again closes nothing silently, it replaces the unfinished one.
 delete from public.quiz_sessions where user_id=auth.uid() and set_id=p_set and status='active';
 insert into public.quiz_sessions(set_id,mode,clock,timer_seconds,layout) values(p_set,p_mode,p_clock,case when p_clock='timer' then p_timer end,p_layout) returning id into result;
 return result;
end;$$;

-- answers: {"<question index>":{"o":<original option index or null>,"x":[eliminated original indices]}}
create or replace function public.quiz_session_save(p_id uuid,p_answers jsonb,p_elapsed bigint,p_finish boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.quiz_sessions; v_questions jsonb; k text; a jsonb; o integer; n_answered integer:=0; n_correct integer:=0; first boolean:=false;
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 select * into s from public.quiz_sessions where id=p_id and user_id=auth.uid() for update;
 if s.id is null then raise exception 'Sessão não encontrada';end if;
 if s.status='done' then raise exception 'Sessão já finalizada';end if;
 if jsonb_typeof(p_answers)<>'object' or p_elapsed is null or p_elapsed<0 then raise exception 'Respostas inválidas';end if;
 select questions into v_questions from public.question_sets where id=s.set_id;
 for k,a in select key,value from jsonb_each(p_answers) loop
  if not (s.layout->'questions') @> to_jsonb(k::integer) then raise exception 'Questão fora da sessão';end if;
  if jsonb_typeof(a)<>'object' then raise exception 'Resposta inválida';end if;
  if a ? 'o' and jsonb_typeof(a->'o')='number' then
   o:=(a->>'o')::integer;
   if o<0 or o>=jsonb_array_length(v_questions->k::integer->'answerOptions') then raise exception 'Alternativa inválida';end if;
   n_answered:=n_answered+1;
   if (v_questions->k::integer->'answerOptions'->o->>'isCorrect')::boolean then n_correct:=n_correct+1;end if;
  end if;
 end loop;
 if p_finish then
  first:=not exists(select 1 from public.quiz_sessions where user_id=auth.uid() and set_id=s.set_id and status='done' and counted);
  update public.quiz_sessions set answers=p_answers,elapsed_ms=least(p_elapsed,864000000),status='done',answered=n_answered,correct=n_correct,counted=first and n_answered>0,finished_at=now(),updated_at=now() where id=p_id;
 else
  update public.quiz_sessions set answers=p_answers,elapsed_ms=least(p_elapsed,864000000),updated_at=now() where id=p_id;
 end if;
 return jsonb_build_object('answered',n_answered,'correct',n_correct,'counted',p_finish and first and n_answered>0);
end;$$;

-- The member's own sessions for one set, newest first (resume + history).
create or replace function public.quiz_sessions_mine(p_set uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'mode',mode,'clock',clock,'timerSeconds',timer_seconds,'layout',layout,'answers',answers,'elapsedMs',elapsed_ms,'status',status,'answered',answered,'correct',correct,'counted',counted,'createdAt',created_at,'finishedAt',finished_at) order by created_at desc),'[]') from public.quiz_sessions where user_id=auth.uid() and set_id=p_set);
end;$$;

revoke all on function private.quiz_layout_valid(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.quiz_session_start(uuid,text,text,integer,jsonb),public.quiz_session_save(uuid,jsonb,bigint,boolean),public.quiz_sessions_mine(uuid) from public,anon;
grant execute on function public.quiz_session_start(uuid,text,text,integer,jsonb),public.quiz_session_save(uuid,jsonb,bigint,boolean),public.quiz_sessions_mine(uuid) to authenticated;

-- Deleting one of the member's own sessions: an unfinished one ("descartar") or a finished attempt.
-- Returns whether it had counted in the statistics, so the app removes its round from the material.
create or replace function public.quiz_session_delete(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.quiz_sessions;
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 delete from public.quiz_sessions where id=p_id and user_id=auth.uid() returning * into s;
 if s.id is null then raise exception 'Sessão não encontrada';end if;
 return jsonb_build_object('status',s.status,'counted',s.counted);
end;$$;
revoke all on function public.quiz_session_delete(uuid) from public,anon;
grant execute on function public.quiz_session_delete(uuid) to authenticated;
