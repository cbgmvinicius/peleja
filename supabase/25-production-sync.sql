-- Functions that were changed or created directly in production and never reached the repository.
-- Copied from the live database on 2026-11-16 so that the numbered files rebuild what is running.
create or replace function public.peleja_score_attempt(p_questions jsonb, p_answers jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare q jsonb; a text; official text; area text; n integer:=0; c integer:=0; ok boolean; complete boolean:=true; stats jsonb:='{}'; item jsonb;
begin
 for q in select value from jsonb_array_elements(p_questions) loop
  official:=upper(trim(coalesce(q->>'official_answer','')));a:=upper(coalesce(p_answers->>(q->>'question_number'),''));
  if official not in ('A','B','C','D','E','X','ANULADA','ANULADO','ANUL') then complete:=false;continue;end if;
  ok:=official in ('X','ANULADA','ANULADO','ANUL') or a=official;
  if not ok and a not in ('A','B','C','D','E','-') then complete:=false;end if;
  n:=n+1;if ok then c:=c+1;end if;
  area:=nullif(q->>'accepted_area','');
  if area is not null then item:=coalesce(stats->area,'{"answered":0,"correct":0,"wrong":0}'::jsonb);stats:=jsonb_set(stats,array[area],jsonb_build_object('answered',(item->>'answered')::int+1,'correct',(item->>'correct')::int+case when ok then 1 else 0 end,'wrong',(item->>'wrong')::int+case when ok then 0 else 1 end));end if;
 end loop;
 return jsonb_build_object('total',n,'correct',c,'wrong',n-c,'area_stats',stats,'complete',complete and n>0);
end $function$;

create or replace function public.simulation_results_next()
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare result jsonb;
begin
 if not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 with attempts as (select user_id,simulation_key,jsonb_object_agg(question_number::text,answer) as answers,max(updated_at) as updated_at from public.simulation_user_answers group by user_id,simulation_key),
 keys as (select simulation_key,jsonb_agg(jsonb_build_object('question_number',question_number,'official_answer',official_answer,'accepted_area',accepted_area) order by question_number) as questions from public.simulation_questions group by simulation_key),
 detailed as (select a.user_id,a.simulation_key,public.peleja_score_attempt(k.questions,a.answers) as score,a.updated_at from attempts a join keys k using(simulation_key)),
 all_results as (
 select user_id,simulation_key,(score->>'total')::int as total,(score->>'correct')::int as correct,(score->>'wrong')::int as wrong,score->'area_stats' as area_stats,updated_at,'answers'::text as mode from detailed where (score->>'complete')::boolean
 union all select user_id,simulation_key,total,correct,wrong,area_stats,updated_at,'quick' from public.simulation_manual_results where basis=public.simulation_basis(simulation_key)),
 latest as (select distinct on(user_id,simulation_key) * from all_results order by user_id,simulation_key,updated_at desc,mode desc)
 select coalesce(jsonb_agg(to_jsonb(latest)),'[]') into result from latest;
 return result;
end $function$;

create or replace function public.save_simulation_attempt_next(p_key text, p_mode text, p_answers jsonb, p_correct integer, p_areas jsonb, p_basis text, p_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare questions jsonb;score jsonb;answer record;area record;n integer;known integer;qc integer;qt integer;sumq integer:=0;sumc integer:=0;stats jsonb:='{}';
begin
 if p_owner is distinct from auth.uid() or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 perform 1 from public.academic_catalog where id for update;
 perform 1 from public.simulation_catalog where key=p_key for update;if not found then raise exception 'Simulado não encontrado';end if;
 if p_basis is distinct from public.simulation_basis(p_key) then raise exception 'CONFLICT: o gabarito mudou. Atualize os dados.';end if;
 if p_mode='delete' then
  delete from public.simulation_manual_results where user_id=p_owner and simulation_key=p_key;
  delete from public.simulation_user_answers where user_id=p_owner and simulation_key=p_key;
  return jsonb_build_object('saved',true);
 end if;
 if p_mode not in ('quick','answers') or p_mode is null or jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(p_areas) is distinct from 'object' then raise exception 'Formato inválido';end if;
 select jsonb_agg(jsonb_build_object('question_number',question_number,'official_answer',official_answer,'accepted_area',accepted_area) order by question_number),count(*) into questions,n from public.simulation_questions where simulation_key=p_key;
 if n<1 or (p_mode='answers' and exists(select 1 from public.simulation_questions where simulation_key=p_key and coalesce(official_answer,'') not in ('A','B','C','D','E','X','ANULADA','ANULADO','ANUL'))) then raise exception 'O gabarito precisa estar completo';end if;
 if p_mode='answers' then
  for answer in select * from jsonb_each_text(p_answers) loop
   if answer.key !~ '^[0-9]+$' or not exists(select 1 from public.simulation_questions where simulation_key=p_key and question_number=answer.key::int) or answer.value not in ('A','B','C','D','E','-') then raise exception 'Resposta inválida';end if;
  end loop;
  score:=public.peleja_score_attempt(questions,p_answers);
  if not (score->>'complete')::boolean then raise exception 'Informe todas as respostas; use - para branco';end if;
  delete from public.simulation_manual_results where user_id=p_owner and simulation_key=p_key;
  delete from public.simulation_user_answers where user_id=p_owner and simulation_key=p_key;
  insert into public.simulation_user_answers(user_id,simulation_key,question_number,answer) select p_owner,p_key,question_number,coalesce(p_answers->>question_number::text,'-') from public.simulation_questions where simulation_key=p_key;
 else
  if p_correct is null or p_correct<0 or p_correct>n then raise exception 'Acertos inválidos';end if;
  for area in select * from jsonb_each(p_areas) loop
   if area.key not in ('Clínica Médica','Cirurgia','Pediatria','Ginecologia e Obstetrícia','Medicina Preventiva / Saúde Coletiva') or jsonb_typeof(area.value) is distinct from 'object' or coalesce(area.value->>'total','') !~ '^[0-9]+$' or coalesce(area.value->>'correct','') !~ '^[0-9]+$' then raise exception 'Área inválida';end if;
   qt:=(area.value->>'total')::int;qc:=(area.value->>'correct')::int;
   select count(*) into known from public.simulation_questions where simulation_key=p_key and accepted_area=area.key;
   if qt<1 or qc<0 or qc>qt or (known>0 and qt<>known) then raise exception 'Confira os valores por área';end if;
   sumq:=sumq+qt;sumc:=sumc+qc;stats:=stats||jsonb_build_object(area.key,jsonb_build_object('answered',qt,'correct',qc,'wrong',qt-qc));
  end loop;
  if sumq>n or sumc>p_correct or sumq-sumc>n-p_correct then raise exception 'Áreas incompatíveis com o total';end if;
  delete from public.simulation_user_answers where user_id=p_owner and simulation_key=p_key;
  insert into public.simulation_manual_results(user_id,simulation_key,total,correct,wrong,area_stats,basis) values(p_owner,p_key,n,p_correct,n-p_correct,stats,p_basis) on conflict(user_id,simulation_key) do update set total=excluded.total,correct=excluded.correct,wrong=excluded.wrong,area_stats=excluded.area_stats,basis=excluded.basis,updated_at=now();
 end if;
 return jsonb_build_object('saved',true);
end $function$;

revoke all on function public.peleja_score_attempt(jsonb,jsonb),public.simulation_results_next(),public.save_simulation_attempt_next(text,text,jsonb,integer,jsonb,text,uuid) from public,anon;
grant execute on function public.peleja_score_attempt(jsonb,jsonb),public.simulation_results_next(),public.save_simulation_attempt_next(text,text,jsonb,integer,jsonb,text,uuid) to authenticated;

create or replace function public.pomodoro_ranking(p_from timestamp with time zone)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
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
          and (h.user_id=auth.uid() or not exists(select 1 from public.ranking_privacy me where me.user_id=auth.uid() and me.mode='hidden'))) m
  left join public.ranking_privacy pr on pr.user_id=m.user_id
  left join (select user_id,sum(focus_ms)::bigint total,count(*) n from public.pomodoro_blocks where started_at>=p_from group by user_id) t on t.user_id=m.user_id
  left join public.pomodoro_live l on l.user_id=m.user_id and l.updated_at>now()-interval '3 minutes');
end;$function$;

create or replace function public.question_suggestion_submit(p_set uuid, p_index integer, p_kind text, p_note text, p_proposed jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_count integer; v_question jsonb; result uuid;
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 select question_count,questions->p_index into v_count,v_question from public.question_sets where id=p_set;
 if v_count is null then raise exception 'Conjunto não encontrado';end if;
 if p_index is null or p_index<0 or p_index>=v_count then raise exception 'Questão não encontrada';end if;
 p_note:=btrim(coalesce(p_note,''));
 if length(p_note) not between 1 and 500 then raise exception 'Explique a mudança em até 500 caracteres';end if;
 if p_proposed is not null then
  if not private.question_proposal_valid(v_question,p_proposed) then raise exception 'A questão proposta está incompleta: enunciado, alternativas e comentários preenchidos e uma alternativa certa';end if;
  p_proposed:=jsonb_build_object('question',btrim(p_proposed->>'question'),'hint',coalesce(btrim(p_proposed->>'hint'),''),
   'answerOptions',(select jsonb_agg(jsonb_build_object('text',btrim(o->>'text'),'rationale',btrim(o->>'rationale'),'isCorrect',(o->>'isCorrect')::boolean) order by i) from jsonb_array_elements(p_proposed->'answerOptions') with ordinality as t(o,i)));
  if p_proposed->'question'=v_question->'question' and p_proposed->'answerOptions'=(select jsonb_agg(jsonb_build_object('text',o->>'text','rationale',o->>'rationale','isCorrect',(o->>'isCorrect')::boolean) order by i) from jsonb_array_elements(v_question->'answerOptions') with ordinality as t(o,i))
   and p_proposed->>'hint'=coalesce(v_question->>'hint','') then p_proposed:=null;end if;
 end if;
 if (select count(*) from public.question_suggestions where user_id=auth.uid() and status='pending')>=50 then raise exception 'Muitas sugestões em análise. Aguarde a revisão';end if;
 insert into public.question_suggestions(set_id,question_index,kind,note,proposed) values(p_set,p_index,p_kind,p_note,p_proposed) returning id into result;
 return result;
end;$function$;

create or replace function public.quiz_session_start(p_set uuid, p_mode text, p_clock text, p_timer integer, p_layout jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_questions jsonb; result uuid;
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 select questions into v_questions from public.question_sets where id=p_set;
 if v_questions is null then raise exception 'Conjunto não encontrado';end if;
 if p_clock='timer' and p_timer is null then raise exception 'Informe o tempo do temporizador';end if;
 if not private.quiz_layout_valid(p_layout,v_questions) then raise exception 'Ordem das questões inválida';end if;
 delete from public.quiz_sessions where user_id=auth.uid() and set_id=p_set and status='active';
 insert into public.quiz_sessions(set_id,mode,clock,timer_seconds,layout) values(p_set,p_mode,p_clock,case when p_clock='timer' then p_timer end,p_layout) returning id into result;
 return result;
end;$function$;
