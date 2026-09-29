-- Run AFTER supabase-schema.sql. One transaction; safe to run again.
begin;
drop function if exists public.save_workspace(jsonb,bigint,bigint,boolean);
drop function if exists public.save_simulation_attempt(text,text,jsonb,jsonb,integer,jsonb,text);


create table if not exists public.account_handles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username in ('vinicius','wilton','ulisses','jonas','tiago')),
  active boolean not null default true
);
alter table public.account_handles enable row level security;
revoke all on public.account_handles from anon, authenticated;
grant select on public.account_handles to authenticated;
grant all on public.account_handles to service_role;

create or replace function public.has_peleja_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.account_handles where user_id=auth.uid() and active);
$$;
create or replace function public.is_peleja_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.account_handles where user_id=auth.uid() and username='vinicius' and active);
$$;
drop policy if exists handles_read on public.account_handles;
create policy handles_read on public.account_handles for select to authenticated using(public.has_peleja_access());

insert into public.access_allowlist(email,desired_role,active)
select username||'@peleja.invalid',case when username='vinicius' then 'admin' else 'member' end,true
from unnest(array['vinicius','wilton','ulisses','jonas','tiago']) as username
on conflict(email) do update set desired_role=excluded.desired_role,active=true;
-- Only provisioned UUIDs in account_handles receive application access.
revoke insert,update,delete on public.access_allowlist from authenticated;
revoke insert(id,display_name), update(display_name,updated_at) on public.profiles from authenticated;
revoke insert,update,delete on public.profiles from authenticated;
grant all on public.profiles,public.access_allowlist to service_role;

create table if not exists public.user_workspace (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.academic_catalog (
  id boolean primary key default true check(id),
  revision bigint not null default 0,
  payload jsonb not null default '{"materials":[],"exams":[],"simulations":[]}',
  updated_at timestamptz not null default now()
);
insert into public.academic_catalog(id) values(true) on conflict do nothing;
alter table public.user_workspace enable row level security;
alter table public.academic_catalog enable row level security;
revoke all on public.user_workspace,public.academic_catalog from anon,authenticated;
grant select on public.user_workspace,public.academic_catalog to authenticated;
drop policy if exists workspace_own on public.user_workspace;
create policy workspace_own on public.user_workspace for select to authenticated using(public.has_peleja_access() and user_id=auth.uid());
drop policy if exists academic_read on public.academic_catalog;
create policy academic_read on public.academic_catalog for select to authenticated using(public.has_peleja_access());

create or replace function public.peleja_area(p_area text,p_subject text) returns text
language sql immutable set search_path='' as $$
  select case
    when lower(coalesce(p_area,'')||' '||coalesce(p_subject,'')) like '%pediatr%' then 'Pediatria'
    when lower(coalesce(p_area,'')||' '||coalesce(p_subject,'')) like '%cirurg%' then 'Cirurgia'
    when lower(coalesce(p_area,'')||' '||coalesce(p_subject,'')) similar to '%(gine|obst)%' then 'Ginecologia e Obstetrícia'
    when lower(coalesce(p_area,'')||' '||coalesce(p_subject,'')) similar to '%(prevent|saúde coletiva|saude coletiva)%' then 'Medicina Preventiva / Saúde Coletiva'
    when lower(coalesce(p_area,'')||' '||coalesce(p_subject,'')) similar to '%(clínica médica|clinica medica)%' then 'Clínica Médica'
    else 'Outra / Interdisciplinar' end;
$$;

create or replace function public.get_workspace() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_record public.user_workspace; v_catalog public.academic_catalog;
begin
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  select * into v_record from public.user_workspace where user_id=auth.uid();
  select * into v_catalog from public.academic_catalog where id;
  return jsonb_build_object('payload',v_record.payload,'revision',coalesce(v_record.revision,0),
    'catalog',v_catalog.payload,'catalog_revision',v_catalog.revision,
    'legacy_owner_id',(select user_id from public.account_handles where username='vinicius'));
end;
$$;

create or replace function public.save_workspace(p_payload jsonb,p_revision bigint,p_catalog_revision bigint,p_publish_catalog boolean,p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_revision bigint; v_cat public.academic_catalog; v_newcat jsonb;
  v_item jsonb; v_entry jsonb; v_q jsonb; v_materials jsonb:='[]'; v_exams jsonb:='[]'; v_sims jsonb:='[]';
  v_questions jsonb; v_ids text[]:='{}'; v_qnums integer[]; v_key text;
  v_total integer; v_correct integer; v_wrong integer; v_num integer; v_area text;
  v_previous jsonb; v_oldanswers jsonb; v_newanswers jsonb;
begin
  if p_owner is distinct from auth.uid() then raise exception 'A conta mudou durante o envio. Tente novamente.'; end if;
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>5000000 then raise exception 'Dados inválidos ou muito grandes'; end if;
  if p_revision is null or p_revision<0 or p_catalog_revision is null or p_catalog_revision<0 then raise exception 'Revisão inválida'; end if;
  for v_key in select unnest(array['materials','exams','simulations']) loop
    if jsonb_typeof(p_payload->v_key) is distinct from 'array' or jsonb_array_length(p_payload->v_key)>3000 then raise exception 'Lista inválida: %',v_key; end if;
    if exists(select 1 from jsonb_array_elements(p_payload->v_key) x where coalesce(x->>'id','')='' or length(x->>'id')>200) then raise exception 'ID inválido'; end if;
    if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_payload->v_key) x) then raise exception 'IDs duplicados'; end if;
  end loop;
  -- A catalog lock establishes one order for concurrent catalog/user updates.
  select * into v_cat from public.academic_catalog where id for update;
  insert into public.user_workspace(user_id,payload) values(v_uid,'{}') on conflict do nothing;
  select revision,payload into v_revision,v_previous from public.user_workspace where user_id=v_uid for update;
  if v_revision<>p_revision then raise exception 'CONFLICT: há alterações mais recentes na nuvem. Exporte seu backup antes de recarregar.'; end if;
  if p_catalog_revision<>v_cat.revision then raise exception 'CONFLICT: o catálogo foi atualizado em outro aparelho. Recarregue os dados.'; end if;
  if p_publish_catalog then
    if not public.is_peleja_admin() then raise exception 'Somente Vinícius pode publicar a estrutura'; end if;
    for v_item in select value from jsonb_array_elements(p_payload->'materials') loop
      v_materials:=v_materials||jsonb_build_array(jsonb_build_object(
        'id',v_item->>'id','title',v_item->>'title','subject',v_item->>'subject','classDate',v_item->>'classDate',
        'classOrder',v_item->'classOrder','code',v_item->>'code','period',v_item->>'period','area',v_item->>'area',
        'specialty',v_item->>'specialty','standalone',v_item->'standalone'));
    end loop;
    for v_item in select value from jsonb_array_elements(p_payload->'exams') loop
      if jsonb_typeof(v_item->'materialIds') is distinct from 'array' then raise exception 'Vínculos inválidos'; end if;
      if exists(select 1 from jsonb_array_elements_text(v_item->'materialIds') id where not exists(
        select 1 from jsonb_array_elements(v_materials) m where m->>'id'=id and m->>'subject'=v_item->>'subject')) then raise exception 'Apostila incompatível com a prova'; end if;
      v_exams:=v_exams||jsonb_build_array(jsonb_build_object('id',v_item->>'id','subject',v_item->>'subject',
        'type',v_item->>'type','date',v_item->>'date','materialIds',v_item->'materialIds','period',v_item->>'period','area',v_item->>'area'));
    end loop;
    for v_item in select value from jsonb_array_elements(p_payload->'simulations') loop
      v_key:='res::'||(v_item->>'id');
      if jsonb_typeof(v_item->'questions') is distinct from 'array' or jsonb_array_length(v_item->'questions') not between 1 and 1000 then raise exception 'Quantidade de questões inválida'; end if;
      v_ids:=array_append(v_ids,v_key); v_qnums:='{}';v_questions:='[]';
      insert into public.simulation_catalog(key,name,date,created_by) values(v_key,v_item->>'name',(v_item->>'date')::date,v_uid)
        on conflict(key) do update set name=excluded.name,date=excluded.date,updated_at=now();
      for v_q in select value from jsonb_array_elements(v_item->'questions') loop
        v_num:=(v_q->>'number')::integer;
        if v_num<1 or v_num=any(v_qnums) then raise exception 'Número de questão inválido'; end if;
        if upper(trim(coalesce(v_q->>'correctAnswer',''))) not in ('','A','B','C','D','E','ANULADA','ANULADO','ANUL') then raise exception 'Gabarito inválido'; end if;
        v_qnums:=array_append(v_qnums,v_num);
        v_questions:=v_questions||jsonb_build_array(jsonb_build_object('id',v_q->>'id','number',v_num,'correctAnswer',upper(trim(coalesce(v_q->>'correctAnswer',''))),'area',v_q->>'area'));
        insert into public.simulation_questions(simulation_key,question_number,official_answer) values(v_key,v_num,upper(trim(coalesce(v_q->>'correctAnswer',''))))
          on conflict(simulation_key,question_number) do update set official_answer=excluded.official_answer,updated_at=now()
          where public.simulation_questions.official_answer is distinct from excluded.official_answer;
        if coalesce(v_q->>'area','')<>'' then
          v_area:=v_q->>'area';
          if v_area not in ('Clínica Médica','Cirurgia','Pediatria','Ginecologia e Obstetrícia','Medicina Preventiva / Saúde Coletiva','Outra / Interdisciplinar') then raise exception 'Área inválida'; end if;
          insert into public.simulation_area_votes(user_id,simulation_key,question_number,area) values(v_uid,v_key,v_num,v_area)
            on conflict(user_id,simulation_key,question_number) do update set area=excluded.area where public.simulation_area_votes.area is distinct from excluded.area;
        else
          delete from public.simulation_area_votes where user_id=v_uid and simulation_key=v_key and question_number=v_num;
        end if;
      end loop;
      delete from public.simulation_questions where simulation_key=v_key and not(question_number=any(v_qnums));
      v_sims:=v_sims||jsonb_build_array(jsonb_build_object('id',v_item->>'id','name',v_item->>'name','date',v_item->>'date','questions',v_questions));
    end loop;
    delete from public.simulation_catalog where not(key=any(v_ids));
    v_newcat:=jsonb_build_object('materials',v_materials,'exams',v_exams,'simulations',v_sims);
    if v_cat.payload is distinct from v_newcat then
      update public.academic_catalog set payload=v_newcat,revision=revision+1,updated_at=now() where id returning * into v_cat;
    end if;
    -- Remove aggregates for deleted faculty exams, including those of other users.
    delete from public.university_results r where not exists(select 1 from jsonb_array_elements(v_exams) e where r.exam_key='fac::'||(e->>'id'));
    update public.university_results r set exam_name=(e->>'subject')||' — '||(e->>'type'),
      exam_date=(e->>'date')::date,area=public.peleja_area(e->>'area',e->>'subject')
      from jsonb_array_elements(v_exams) e where r.exam_key='fac::'||(e->>'id');
    -- Import/update the owner's local answers only when those answers actually change.
    -- A general progress sync must not overwrite a quick result saved in the shared editor.
    for v_item in select value from jsonb_array_elements(p_payload->'simulations') loop
      v_key:='res::'||(v_item->>'id');
      select coalesce(jsonb_object_agg(q->>'number',upper(trim(q->>'userAnswer'))),'{}') into v_newanswers
        from jsonb_array_elements(v_item->'questions') q where coalesce(q->>'userAnswer','')<>'';
      select coalesce(jsonb_object_agg(q->>'number',upper(trim(q->>'userAnswer'))),'{}') into v_oldanswers
        from jsonb_array_elements(coalesce(v_previous->'simulations','[]')) s,
          jsonb_array_elements(s->'questions') q where s->>'id'=v_item->>'id' and coalesce(q->>'userAnswer','')<>'';
      if v_newanswers is distinct from v_oldanswers then
        if exists(select 1 from jsonb_each_text(v_newanswers) a where a.value not in ('A','B','C','D','E')) then raise exception 'Resposta pessoal inválida'; end if;
        delete from public.simulation_manual_results where user_id=v_uid and simulation_key=v_key;
        delete from public.simulation_user_answers where user_id=v_uid and simulation_key=v_key;
        insert into public.simulation_user_answers(user_id,simulation_key,question_number,answer)
          select v_uid,v_key,key::integer,value from jsonb_each_text(v_newanswers);
      end if;
    end loop;
  end if;

  -- Rebuild this user's aggregates inside the same transaction as the private snapshot.
  delete from public.university_results where user_id=v_uid;
  for v_item in select value from jsonb_array_elements(p_payload->'exams') loop
    if v_item->>'total' is null then continue; end if;
    v_total:=(v_item->>'total')::integer;v_correct:=(v_item->>'correct')::integer;v_wrong:=(v_item->>'wrong')::integer;
    if v_total is null or v_correct is null or v_wrong is null or v_total<1 or v_correct<0 or v_wrong<0 or v_correct+v_wrong<>v_total then raise exception 'Resultado de prova inválido'; end if;
    select value into v_entry from jsonb_array_elements(v_cat.payload->'exams') where value->>'id'=v_item->>'id';
    if v_entry is null then raise exception 'Prova não pertence ao catálogo'; end if;
    insert into public.university_results(user_id,exam_key,exam_name,exam_date,area,total,correct,wrong)
      values(v_uid,'fac::'||(v_entry->>'id'),(v_entry->>'subject')||' — '||(v_entry->>'type'),(v_entry->>'date')::date,
        public.peleja_area(v_entry->>'area',v_entry->>'subject'),v_total,v_correct,v_wrong);
  end loop;
  delete from public.material_area_results where user_id=v_uid;
  for v_item in select value from jsonb_array_elements(p_payload->'materials') loop
    select value into v_q from jsonb_array_elements(v_cat.payload->'materials') where value->>'id'=v_item->>'id';
    if v_q is null then continue; end if;
    if jsonb_typeof(v_item->'questionEntries') is distinct from 'array' then raise exception 'Histórico de questões inválido'; end if;
    v_area:=public.peleja_area(v_q->>'area',v_q->>'subject');
    for v_entry in select value from jsonb_array_elements(v_item->'questionEntries') loop
      v_total:=(v_entry->>'questions')::integer;v_correct:=(v_entry->>'correct')::integer;v_wrong:=(v_entry->>'wrong')::integer;
      if v_total is null or v_correct is null or v_wrong is null or v_total<1 or v_correct<0 or v_wrong<0 or v_correct+v_wrong<>v_total then raise exception 'Sessão de questões inválida'; end if;
      insert into public.material_area_results(user_id,area,total,correct,wrong) values(v_uid,v_area,v_total,v_correct,v_wrong)
        on conflict(user_id,area) do update set total=public.material_area_results.total+excluded.total,
          correct=public.material_area_results.correct+excluded.correct,wrong=public.material_area_results.wrong+excluded.wrong,updated_at=now();
    end loop;
  end loop;
  update public.user_workspace set payload=p_payload,revision=revision+1,updated_at=now() where user_id=v_uid returning revision into v_revision;
  return jsonb_build_object('revision',v_revision,'catalog_revision',v_cat.revision);
end;
$$;

-- Manual results are valid only against exactly the classification/key used when entered.
alter table public.simulation_manual_results add column if not exists basis text;
create or replace function public.simulation_basis(p_key text) returns text language sql stable security definer set search_path='' as $$
  select md5(coalesce(jsonb_agg(jsonb_build_array(question_number,official_answer,accepted_area) order by question_number)::text,'[]'))
  from public.simulation_questions where simulation_key=p_key;
$$;
create or replace function public.simulation_bases() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  return coalesce((select jsonb_object_agg(key,public.simulation_basis(key)) from public.simulation_catalog),'{}');
end;
$$;

create or replace function public.save_simulation_attempt(p_key text,p_mode text,p_answers jsonb,p_votes jsonb,p_correct integer,p_areas jsonb,p_basis text,p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_q public.simulation_questions;v_vote record;v_ans text;v_total integer;v_n integer;v_sum integer:=0;v_classified integer:=0;v_stats jsonb:='{}';v_row record;v_basis text;
begin
  if p_owner is distinct from auth.uid() then raise exception 'A conta mudou durante o envio. Tente novamente.'; end if;
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  -- Serialize with catalog publication and other attempts that may change consensus.
  perform 1 from public.academic_catalog where id for update;
  perform 1 from public.simulation_catalog where key=p_key for update;
  if not found then raise exception 'Evento não encontrado'; end if;
  if p_mode not in ('answers','quick') or p_mode is null then raise exception 'Modalidade inválida'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(p_votes) is distinct from 'object' or jsonb_typeof(p_areas) is distinct from 'object' then raise exception 'Formato inválido'; end if;
  if p_basis is distinct from public.simulation_basis(p_key) then raise exception 'CONFLICT: gabarito ou áreas mudaram. Reabra o evento.'; end if;
  for v_vote in select * from jsonb_each_text(p_votes) loop
    if v_vote.key !~ '^[0-9]+$' or not exists(select 1 from public.simulation_questions where simulation_key=p_key and question_number=v_vote.key::integer) then raise exception 'Questão inexistente'; end if;
    if v_vote.value not in ('Clínica Médica','Cirurgia','Pediatria','Ginecologia e Obstetrícia','Medicina Preventiva / Saúde Coletiva','Outra / Interdisciplinar') then raise exception 'Área inválida'; end if;
  end loop;
  -- A quick result must describe the currently displayed basis; voting is a separate action.
  if p_mode='answers' then
    delete from public.simulation_area_votes where user_id=v_uid and simulation_key=p_key and not(p_votes ? question_number::text);
    for v_vote in select * from jsonb_each_text(p_votes) loop
      insert into public.simulation_area_votes(user_id,simulation_key,question_number,area) values(v_uid,p_key,v_vote.key::integer,v_vote.value)
        on conflict(user_id,simulation_key,question_number) do update set area=excluded.area where public.simulation_area_votes.area is distinct from excluded.area;
    end loop;
  end if;
  select count(*) into v_total from public.simulation_questions where simulation_key=p_key and official_answer in ('A','B','C','D','E');
  if v_total=0 then raise exception 'Gabarito ainda não publicado'; end if;
  if p_mode='quick' then
    if p_correct is null or p_correct<0 or p_correct>v_total then raise exception 'Acertos totais inválidos'; end if;
    for v_row in select key,value from jsonb_each(p_areas) loop
      if jsonb_typeof(v_row.value)<>'number' or (v_row.value::text) !~ '^[0-9]+$' then raise exception 'Acertos por área inválidos'; end if;
      select count(*) into v_n from public.simulation_questions where simulation_key=p_key and official_answer in ('A','B','C','D','E') and accepted_area=v_row.key;
      if v_n=0 or v_row.value::text::integer>v_n then raise exception 'Acertos por área fora do limite'; end if;
      v_sum:=v_sum+v_row.value::text::integer;v_classified:=v_classified+v_n;
      v_stats:=v_stats||jsonb_build_object(v_row.key,jsonb_build_object('answered',v_n,'correct',v_row.value::text::integer,'wrong',v_n-v_row.value::text::integer));
    end loop;
    if v_sum>p_correct or p_correct-v_sum>v_total-v_classified then raise exception 'Acertos totais incompatíveis com as áreas informadas'; end if;
    delete from public.simulation_user_answers where user_id=v_uid and simulation_key=p_key;
    v_basis:=public.simulation_basis(p_key);
    insert into public.simulation_manual_results(user_id,simulation_key,total,correct,wrong,area_stats,basis) values(v_uid,p_key,v_total,p_correct,v_total-p_correct,v_stats,v_basis)
      on conflict(user_id,simulation_key) do update set total=excluded.total,correct=excluded.correct,wrong=excluded.wrong,area_stats=excluded.area_stats,basis=excluded.basis,updated_at=now();
  else
    for v_vote in select * from jsonb_each_text(p_answers) loop
      if v_vote.key !~ '^[0-9]+$' or not exists(select 1 from public.simulation_questions where simulation_key=p_key and question_number=v_vote.key::integer) then raise exception 'Questão inexistente'; end if;
      if upper(trim(v_vote.value)) not in ('A','B','C','D','E') then raise exception 'Resposta inválida'; end if;
    end loop;
    for v_q in select * from public.simulation_questions where simulation_key=p_key and official_answer in ('A','B','C','D','E') loop
      if coalesce(p_answers->>v_q.question_number::text,'')='' then raise exception 'Preencha todas as respostas'; end if;
    end loop;
    delete from public.simulation_manual_results where user_id=v_uid and simulation_key=p_key;
    delete from public.simulation_user_answers where user_id=v_uid and simulation_key=p_key;
    for v_vote in select * from jsonb_each_text(p_answers) loop
      insert into public.simulation_user_answers(user_id,simulation_key,question_number,answer) values(v_uid,p_key,v_vote.key::integer,upper(trim(v_vote.value)));
    end loop;
  end if;
  return jsonb_build_object('saved',true,'basis',public.simulation_basis(p_key));
end;
$$;

-- All writes now go through transactional, validated entry points.
revoke insert,update,delete on public.simulation_catalog,public.simulation_questions,public.simulation_user_answers,
  public.simulation_area_votes,public.simulation_manual_results,public.university_results,public.material_area_results from authenticated;
revoke all on function public.rebuild_simulation_results(text),public.recalculate_question_consensus(text,integer),
  public.after_simulation_answer_change(),public.after_simulation_vote_change(),public.after_simulation_question_change(),
  public.handle_new_user(),public.enforce_invited_signup(),public.peleja_area(text,text),public.simulation_basis(text) from public,anon,authenticated;
revoke all on function public.get_workspace(),public.save_workspace(jsonb,bigint,bigint,boolean,uuid),public.simulation_bases(),
  public.save_simulation_attempt(text,text,jsonb,jsonb,integer,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.get_workspace(),public.save_workspace(jsonb,bigint,bigint,boolean,uuid),public.simulation_bases(),
  public.save_simulation_attempt(text,text,jsonb,jsonb,integer,jsonb,text,uuid) to authenticated;
revoke all on function public.has_peleja_access(),public.is_peleja_admin() from public,anon;
grant execute on function public.has_peleja_access(),public.is_peleja_admin() to authenticated;

-- Personal exports include online attempts; never another participant's raw answers.
create or replace function public.export_own_attempts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  return jsonb_build_object(
    'answers',coalesce((select jsonb_agg(to_jsonb(a)-'user_id') from public.simulation_user_answers a where user_id=auth.uid()),'[]'),
    'votes',coalesce((select jsonb_agg(to_jsonb(a)-'user_id') from public.simulation_area_votes a where user_id=auth.uid()),'[]'),
    'manual',coalesce((select jsonb_agg(to_jsonb(a)-'user_id') from public.simulation_manual_results a where user_id=auth.uid()),'[]'));
end;
$$;

create or replace function public.restore_personal_backup(p_backup jsonb,p_revision bigint,p_catalog_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_row jsonb; v_key text; v_areas jsonb; v_attempts jsonb:=p_backup->'cloudAttempts';
begin
  if not public.has_peleja_access() or p_backup->>'owner' is distinct from 'user:'||auth.uid()::text then raise exception 'Backup de outra conta'; end if;
  if octet_length(p_backup::text)>10000000 then raise exception 'Backup grande demais'; end if;
  foreach v_key in array array['answers','votes','manual'] loop
    if jsonb_typeof(v_attempts->v_key) is distinct from 'array' then raise exception 'Backup incompleto'; end if;
  end loop;
  v_result:=public.save_workspace(jsonb_build_object('materials',p_backup->'materials','exams',p_backup->'exams','simulations',p_backup->'simulations'),p_revision,p_catalog_revision,public.is_peleja_admin(),auth.uid());
  delete from public.simulation_manual_results where user_id=auth.uid();
  delete from public.simulation_user_answers where user_id=auth.uid();
  delete from public.simulation_area_votes where user_id=auth.uid();
  for v_row in select value from jsonb_array_elements(v_attempts->'votes') loop
    if v_row->>'area' is null or v_row->>'area' not in ('Clínica Médica','Cirurgia','Pediatria','Ginecologia e Obstetrícia','Medicina Preventiva / Saúde Coletiva','Outra / Interdisciplinar') then raise exception 'Área inválida'; end if;
    insert into public.simulation_area_votes(user_id,simulation_key,question_number,area)
      values(auth.uid(),v_row->>'simulation_key',(v_row->>'question_number')::integer,v_row->>'area');
  end loop;
  for v_row in select value from jsonb_array_elements(v_attempts->'answers') loop
    if v_row->>'answer' is null or v_row->>'answer' not in ('','A','B','C','D','E') then raise exception 'Resposta inválida'; end if;
    insert into public.simulation_user_answers(user_id,simulation_key,question_number,answer)
      values(auth.uid(),v_row->>'simulation_key',(v_row->>'question_number')::integer,v_row->>'answer');
  end loop;
  for v_row in select value from jsonb_array_elements(v_attempts->'manual') loop
    if exists(select 1 from public.simulation_user_answers where user_id=auth.uid() and simulation_key=v_row->>'simulation_key') then raise exception 'Modalidades duplicadas'; end if;
    select coalesce(jsonb_object_agg(key,value->'correct'),'{}') into v_areas from jsonb_each(v_row->'area_stats');
    perform public.save_simulation_attempt(v_row->>'simulation_key','quick','{}','{}',(v_row->>'correct')::integer,v_areas,v_row->>'basis',auth.uid());
  end loop;
  return v_result;
end;
$$;
revoke all on function public.export_own_attempts(),public.restore_personal_backup(jsonb,bigint,bigint) from public,anon;
grant execute on function public.export_own_attempts(),public.restore_personal_backup(jsonb,bigint,bigint) to authenticated;

commit;
