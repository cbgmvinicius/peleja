-- Suggestions AnkiHub style: the member edits the question itself (proposed) and explains why; the
-- administrator sees before/after and accepting applies the proposed question to the set.
alter table public.question_suggestions add column if not exists proposed jsonb;

-- A proposed question must keep the shape of the current one: same number of options, texts and comments
-- filled in, exactly one correct option.
create or replace function private.question_proposal_valid(p_current jsonb,p_proposed jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare o jsonb; n_right integer:=0;
begin
 if jsonb_typeof(p_proposed)<>'object' or length(p_proposed::text)>20000 then return false;end if;
 if jsonb_typeof(p_proposed->'question')<>'string' or btrim(p_proposed->>'question')='' then return false;end if;
 if jsonb_typeof(p_proposed->'answerOptions')<>'array' or jsonb_array_length(p_proposed->'answerOptions')<>jsonb_array_length(p_current->'answerOptions') then return false;end if;
 if p_proposed ? 'hint' and jsonb_typeof(p_proposed->'hint') not in ('string','null') then return false;end if;
 for o in select value from jsonb_array_elements(p_proposed->'answerOptions') loop
  if jsonb_typeof(o->'text')<>'string' or btrim(o->>'text')='' or jsonb_typeof(o->'rationale')<>'string' or btrim(o->>'rationale')='' or jsonb_typeof(o->'isCorrect')<>'boolean' then return false;end if;
  if (o->>'isCorrect')::boolean then n_right:=n_right+1;end if;
 end loop;
 return n_right=1;
end;$$;
revoke all on function private.question_proposal_valid(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.question_suggestion_submit(p_set uuid,p_index integer,p_kind text,p_note text,p_proposed jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
  -- keep only the fields that exist in a question
  p_proposed:=jsonb_build_object('question',btrim(p_proposed->>'question'),'hint',coalesce(btrim(p_proposed->>'hint'),''),
   'answerOptions',(select jsonb_agg(jsonb_build_object('text',btrim(o->>'text'),'rationale',btrim(o->>'rationale'),'isCorrect',(o->>'isCorrect')::boolean) order by i) from jsonb_array_elements(p_proposed->'answerOptions') with ordinality as t(o,i)));
  if p_proposed->'question'=v_question->'question' and p_proposed->'answerOptions'=(select jsonb_agg(jsonb_build_object('text',o->>'text','rationale',o->>'rationale','isCorrect',(o->>'isCorrect')::boolean) order by i) from jsonb_array_elements(v_question->'answerOptions') with ordinality as t(o,i))
   and p_proposed->>'hint'=coalesce(v_question->>'hint','') then p_proposed:=null;end if;
 end if;
 if (select count(*) from public.question_suggestions where user_id=auth.uid() and status='pending')>=50 then raise exception 'Muitas sugestões em análise. Aguarde a revisão';end if;
 insert into public.question_suggestions(set_id,question_index,kind,note,proposed) values(p_set,p_index,p_kind,p_note,p_proposed) returning id into result;
 return result;
end;$$;

-- Pages still open with the old form (explanation only).
create or replace function public.question_suggestion_submit(p_set uuid,p_index integer,p_kind text,p_note text) returns uuid language sql security definer set search_path='' as $$
 select public.question_suggestion_submit(p_set,p_index,p_kind,p_note,null::jsonb);
$$;

create or replace function public.question_suggestions_review_list(p_status text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_peleja_admin() then raise exception 'Acesso negado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'setId',g.set_id,'setTitle',s.title,'index',g.question_index,'question',s.questions->g.question_index,'proposed',g.proposed,
   'kind',g.kind,'note',g.note,'status',g.status,'createdAt',g.created_at,'reviewedAt',g.reviewed_at,'author',coalesce(p.display_name,h.username,'Membro')) order by g.created_at),'[]'::jsonb)
  from public.question_suggestions g join public.question_sets s on s.id=g.set_id
  left join public.profiles p on p.id=g.user_id left join public.account_handles h on h.user_id=g.user_id
  where p_status is null or g.status=p_status);
end;$$;

-- Accepting a suggestion with a proposed question applies it to the set (other fields of the question stay).
create or replace function public.question_suggestion_review(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare g public.question_suggestions; v_question jsonb;
begin
 if auth.uid() is null or not public.is_peleja_admin() then raise exception 'Acesso negado';end if;
 select * into g from public.question_suggestions where id=p_id and status='pending' for update;
 if g.id is null then raise exception 'Sugestão não encontrada ou já revisada';end if;
 if p_accept and g.proposed is not null then
  select questions->g.question_index into v_question from public.question_sets where id=g.set_id for update;
  if v_question is null or not private.question_proposal_valid(v_question,g.proposed) then raise exception 'A questão mudou desde a sugestão (quantidade de alternativas). Edite à mão e recuse esta';end if;
  update public.question_sets set questions=jsonb_set(questions,array[g.question_index::text],
   v_question||jsonb_build_object('question',g.proposed->'question','hint',g.proposed->'hint','answerOptions',
    (select jsonb_agg(coalesce(v_question->'answerOptions'->(i-1)::integer,'{}'::jsonb)||o order by i) from jsonb_array_elements(g.proposed->'answerOptions') with ordinality as t(o,i))))
  where id=g.set_id;
 end if;
 update public.question_suggestions set status=case when p_accept then 'accepted' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid() where id=p_id;
end;$$;

revoke all on function public.question_suggestion_submit(uuid,integer,text,text,jsonb),public.question_suggestion_submit(uuid,integer,text,text),public.question_suggestions_review_list(text),public.question_suggestion_review(uuid,boolean) from public,anon;
grant execute on function public.question_suggestion_submit(uuid,integer,text,text,jsonb),public.question_suggestion_submit(uuid,integer,text,text),public.question_suggestions_review_list(text),public.question_suggestion_review(uuid,boolean) to authenticated;
