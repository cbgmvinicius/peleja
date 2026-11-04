-- Question sets imported from NotebookLM quizzes (extension "Peleja — Extrair questões").
-- Each set belongs to one material (apostila) of the shared catalog. Only the administrator
-- creates or removes sets; authorized members can list them. The table is reachable only
-- through the functions below.
create table if not exists public.question_sets (
 id uuid primary key default gen_random_uuid(),
 material_id text not null check(length(material_id) between 1 and 200),
 title text not null check(length(title) between 1 and 200),
 source_url text not null default '' check(length(source_url)<=2000),
 questions jsonb not null check(jsonb_typeof(questions)='array'),
 question_count integer not null check(question_count between 1 and 1000),
 fingerprint text not null unique check(fingerprint ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists question_sets_material_idx on public.question_sets(material_id);
alter table public.question_sets enable row level security;
revoke all on public.question_sets from public,anon,authenticated;

-- Summaries only; the full questions are returned per set by question_set().
create or replace function public.question_sets_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'materialId',material_id,'title',title,'sourceUrl',source_url,'count',question_count,'fingerprint',fingerprint,'createdAt',created_at) order by created_at desc),'[]') from public.question_sets);
end;$$;

create or replace function public.question_set(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_peleja_access() then raise exception 'Acesso negado';end if;
 return (select jsonb_build_object('id',id,'materialId',material_id,'title',title,'sourceUrl',source_url,'questions',questions,'createdAt',created_at) from public.question_sets where id=p_id);
end;$$;

create or replace function public.save_question_set(p_material_id text,p_title text,p_source_url text,p_questions jsonb,p_fingerprint text) returns uuid language plpgsql security definer set search_path='' as $$
declare q jsonb; a jsonb; i integer:=0; correct integer; result uuid;
begin
 if auth.uid() is null or not public.is_peleja_admin() then raise exception 'Acesso negado';end if;
 if p_material_id is null or not exists(select 1 from public.academic_catalog c,jsonb_array_elements(c.payload->'materials') m where c.id and m->>'id'=p_material_id) then raise exception 'Apostila não encontrada';end if;
 p_title:=btrim(coalesce(p_title,''));
 if length(p_title) not between 1 and 200 then raise exception 'Título inválido';end if;
 p_source_url:=coalesce(p_source_url,'');
 if p_source_url<>'' and p_source_url !~ '^https://(notebook|notebooklm)\.google\.com/' then raise exception 'Origem inválida';end if;
 if jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 1000 then raise exception 'Quantidade de questões inválida';end if;
 if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Identificador inválido';end if;
 for q in select value from jsonb_array_elements(p_questions) loop
  i:=i+1;
  if jsonb_typeof(q->'question')<>'string' or btrim(q->>'question')='' or jsonb_typeof(q->'answerOptions')<>'array' or jsonb_array_length(q->'answerOptions') not between 2 and 20 then raise exception 'Questão % inválida',i;end if;
  correct:=0;
  for a in select value from jsonb_array_elements(q->'answerOptions') loop
   if jsonb_typeof(a->'text')<>'string' or btrim(a->>'text')='' or jsonb_typeof(a->'rationale')<>'string' or btrim(a->>'rationale')='' or jsonb_typeof(a->'isCorrect')<>'boolean' then raise exception 'Questão %: alternativa ou comentário incompleto',i;end if;
   if (a->>'isCorrect')::boolean then correct:=correct+1;end if;
  end loop;
  if correct<>1 then raise exception 'Questão %: gabarito ambíguo',i;end if;
 end loop;
 insert into public.question_sets(material_id,title,source_url,questions,question_count,fingerprint,created_by)
 values(p_material_id,p_title,p_source_url,p_questions,jsonb_array_length(p_questions),p_fingerprint,auth.uid())
 on conflict(fingerprint) do nothing returning id into result;
 if result is null then raise exception 'Este conjunto já está no Peleja';end if;
 return result;
end;$$;

create or replace function public.delete_question_set(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_peleja_admin() then raise exception 'Acesso negado';end if;
 delete from public.question_sets where id=p_id;
end;$$;

revoke all on function public.question_sets_list(),public.question_set(uuid),public.save_question_set(text,text,text,jsonb,text),public.delete_question_set(uuid) from public,anon;
grant execute on function public.question_sets_list(),public.question_set(uuid),public.save_question_set(text,text,text,jsonb,text),public.delete_question_set(uuid) to authenticated;
