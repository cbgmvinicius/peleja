-- Which attempt counts: only the first finished attempt that covers the whole set ("Refazer erradas"
-- and other partial attempts never count, even after the counted one is deleted). Plus the list of the
-- member's counted attempts, so the app can make sure each one is in the statistics.
create or replace function public.quiz_session_save(p_id uuid,p_answers jsonb,p_elapsed bigint,p_finish boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.quiz_sessions; v_questions jsonb; v_count integer; k text; a jsonb; o integer; n_answered integer:=0; n_correct integer:=0; first boolean:=false;
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 select * into s from public.quiz_sessions where id=p_id and user_id=auth.uid() for update;
 if s.id is null then raise exception 'Sessão não encontrada';end if;
 if s.status='done' then raise exception 'Sessão já finalizada';end if;
 if jsonb_typeof(p_answers)<>'object' or p_elapsed is null or p_elapsed<0 then raise exception 'Respostas inválidas';end if;
 select questions,question_count into v_questions,v_count from public.question_sets where id=s.set_id;
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
  first:=jsonb_array_length(s.layout->'questions')=v_count
   and not exists(select 1 from public.quiz_sessions where user_id=auth.uid() and set_id=s.set_id and status='done' and counted);
  update public.quiz_sessions set answers=p_answers,elapsed_ms=least(p_elapsed,864000000),status='done',answered=n_answered,correct=n_correct,counted=first and n_answered>0,finished_at=now(),updated_at=now() where id=p_id;
 else
  update public.quiz_sessions set answers=p_answers,elapsed_ms=least(p_elapsed,864000000),updated_at=now() where id=p_id;
 end if;
 return jsonb_build_object('answered',n_answered,'correct',n_correct,'counted',p_finish and first and n_answered>0);
end;$$;

create or replace function public.quiz_sessions_counted() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'setId',s.set_id,'materialId',q.material_id,'examId',q.exam_id,'answered',s.answered,'correct',s.correct,'finishedAt',s.finished_at) order by s.finished_at),'[]'::jsonb)
  from public.quiz_sessions s join public.question_sets q on q.id=s.set_id where s.user_id=auth.uid() and s.status='done' and s.counted);
end;$$;

revoke all on function public.quiz_session_save(uuid,jsonb,bigint,boolean),public.quiz_sessions_counted() from public,anon;
grant execute on function public.quiz_session_save(uuid,jsonb,bigint,boolean),public.quiz_sessions_counted() to authenticated;
