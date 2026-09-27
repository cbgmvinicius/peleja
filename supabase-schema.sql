-- Peleja — backend social (Supabase)
-- Contas, papéis, eventos de Residência, consenso de grande área e rankings.
-- Pode ser executado novamente: as policies são recriadas de forma idempotente.

create table if not exists public.access_allowlist (
  email text primary key,
  desired_role text not null default 'member' check (desired_role in ('admin','member')),
  active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.has_peleja_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.access_allowlist a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and a.active
  );
$$;

revoke all on function public.has_peleja_access() from public;
grant execute on function public.has_peleja_access() to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists role text not null default 'member';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','member'));

create or replace function public.is_peleja_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and public.has_peleja_access()
  );
$$;

revoke all on function public.is_peleja_admin() from public;
grant execute on function public.is_peleja_admin() to authenticated;

create table if not exists public.simulation_catalog (
  key text primary key,
  name text not null,
  date date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.simulation_catalog add column if not exists updated_at timestamptz not null default now();

create table if not exists public.simulation_questions (
  simulation_key text not null references public.simulation_catalog(key) on delete cascade,
  question_number integer not null check (question_number > 0),
  official_answer text not null default '',
  accepted_area text,
  updated_at timestamptz not null default now(),
  primary key (simulation_key, question_number)
);

create table if not exists public.simulation_user_answers (
  user_id uuid not null references auth.users(id) on delete cascade,
  simulation_key text not null,
  question_number integer not null,
  answer text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, simulation_key, question_number),
  foreign key (simulation_key, question_number)
    references public.simulation_questions(simulation_key, question_number)
    on delete cascade
);

create table if not exists public.simulation_area_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  simulation_key text not null,
  question_number integer not null,
  area text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, simulation_key, question_number),
  foreign key (simulation_key, question_number)
    references public.simulation_questions(simulation_key, question_number)
    on delete cascade
);

create table if not exists public.simulation_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  simulation_key text not null references public.simulation_catalog(key) on delete cascade,
  total integer not null check (total >= 0),
  correct integer not null check (correct >= 0),
  wrong integer not null check (wrong >= 0),
  area_stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, simulation_key),
  constraint simulation_result_sum check (correct + wrong <= total)
);

create table if not exists public.simulation_manual_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  simulation_key text not null references public.simulation_catalog(key) on delete cascade,
  total integer not null check (total >= 0),
  correct integer not null check (correct >= 0),
  wrong integer not null check (wrong >= 0),
  area_stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, simulation_key),
  constraint simulation_manual_result_sum check (correct + wrong = total)
);

create table if not exists public.university_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_key text not null,
  exam_name text not null,
  exam_date date,
  area text not null,
  total integer not null check (total >= 0),
  correct integer not null check (correct >= 0),
  wrong integer not null check (wrong >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, exam_key),
  constraint university_result_sum check (correct + wrong <= total)
);

create table if not exists public.material_area_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null,
  total integer not null check (total >= 0),
  correct integer not null check (correct >= 0),
  wrong integer not null check (wrong >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, area),
  constraint material_result_sum check (correct + wrong <= total)
);

create or replace function public.rebuild_simulation_results(p_simulation_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_question_count integer;
  v_answered integer;
  v_correct integer;
  v_wrong integer;
  v_area_stats jsonb;
begin
  select count(*)
  into v_question_count
  from public.simulation_questions q
  where q.simulation_key = p_simulation_key
    and nullif(trim(q.official_answer), '') is not null
    and upper(trim(q.official_answer)) not in ('ANULADA','ANULADO','ANUL');

  delete from public.simulation_results r
  where r.simulation_key = p_simulation_key
    and not exists (
      select 1
      from public.simulation_user_answers a
      where a.simulation_key = p_simulation_key
        and a.user_id = r.user_id
    );

  for v_user in
    select distinct a.user_id
    from public.simulation_user_answers a
    where a.simulation_key = p_simulation_key
  loop
    select
      count(*) filter (where nullif(trim(a.answer), '') is not null),
      count(*) filter (
        where nullif(trim(a.answer), '') is not null
          and upper(trim(a.answer)) = upper(trim(q.official_answer))
      ),
      count(*) filter (
        where nullif(trim(a.answer), '') is not null
          and upper(trim(a.answer)) <> upper(trim(q.official_answer))
      )
    into v_answered, v_correct, v_wrong
    from public.simulation_questions q
    left join public.simulation_user_answers a
      on a.simulation_key = q.simulation_key
     and a.question_number = q.question_number
     and a.user_id = v_user
    where q.simulation_key = p_simulation_key
      and nullif(trim(q.official_answer), '') is not null
      and upper(trim(q.official_answer)) not in ('ANULADA','ANULADO','ANUL');

    if v_question_count = 0 or v_answered < v_question_count then
      delete from public.simulation_results
      where user_id = v_user and simulation_key = p_simulation_key;
      continue;
    end if;

    select coalesce(
      jsonb_object_agg(
        grouped.area,
        jsonb_build_object(
          'answered', grouped.answered,
          'correct', grouped.correct,
          'wrong', grouped.wrong
        )
      ),
      '{}'::jsonb
    )
    into v_area_stats
    from (
      select
        q.accepted_area as area,
        count(*) as answered,
        count(*) filter (where upper(trim(a.answer)) = upper(trim(q.official_answer))) as correct,
        count(*) filter (where upper(trim(a.answer)) <> upper(trim(q.official_answer))) as wrong
      from public.simulation_questions q
      join public.simulation_user_answers a
        on a.simulation_key = q.simulation_key
       and a.question_number = q.question_number
       and a.user_id = v_user
      where q.simulation_key = p_simulation_key
        and q.accepted_area is not null
        and nullif(trim(q.official_answer), '') is not null
        and upper(trim(q.official_answer)) not in ('ANULADA','ANULADO','ANUL')
      group by q.accepted_area
    ) grouped;

    insert into public.simulation_results (
      user_id, simulation_key, total, correct, wrong, area_stats, updated_at
    )
    values (
      v_user, p_simulation_key, v_question_count, v_correct, v_wrong, v_area_stats, now()
    )
    on conflict (user_id, simulation_key)
    do update set
      total = excluded.total,
      correct = excluded.correct,
      wrong = excluded.wrong,
      area_stats = excluded.area_stats,
      updated_at = excluded.updated_at;
  end loop;
end;
$$;

create or replace function public.recalculate_question_consensus(
  p_simulation_key text,
  p_question_number integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_winner text;
  v_winner_count bigint;
  v_ties bigint;
begin
  select v.area, count(*)
  into v_winner, v_winner_count
  from public.simulation_area_votes v
  where v.simulation_key = p_simulation_key
    and v.question_number = p_question_number
  group by v.area
  order by count(*) desc, v.area asc
  limit 1;

  if v_winner is null then
    update public.simulation_questions
    set accepted_area = null, updated_at = now()
    where simulation_key = p_simulation_key
      and question_number = p_question_number;
  else
    select count(*)
    into v_ties
    from (
      select v.area
      from public.simulation_area_votes v
      where v.simulation_key = p_simulation_key
        and v.question_number = p_question_number
      group by v.area
      having count(*) = v_winner_count
    ) tied;

    update public.simulation_questions
    set accepted_area = case when v_ties = 1 then v_winner else null end,
        updated_at = now()
    where simulation_key = p_simulation_key
      and question_number = p_question_number;
  end if;

  perform public.rebuild_simulation_results(p_simulation_key);
end;
$$;

create or replace function public.after_simulation_answer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rebuild_simulation_results(coalesce(new.simulation_key, old.simulation_key));
  return null;
end;
$$;

create or replace function public.after_simulation_vote_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalculate_question_consensus(
    coalesce(new.simulation_key, old.simulation_key),
    coalesce(new.question_number, old.question_number)
  );
  return null;
end;
$$;

create or replace function public.after_simulation_question_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  perform public.rebuild_simulation_results(coalesce(new.simulation_key, old.simulation_key));
  return null;
end;
$;
-- Funções internas do backend: executadas apenas por triggers ou por outras funções do banco.
-- O navegador não precisa (nem deve) poder chamá-las diretamente via RPC.
revoke all on function public.rebuild_simulation_results(text) from PUBLIC, anon, authenticated;
revoke all on function public.recalculate_question_consensus(text, integer) from PUBLIC, anon, authenticated;
revoke all on function public.after_simulation_answer_change() from PUBLIC, anon, authenticated;
revoke all on function public.after_simulation_vote_change() from PUBLIC, anon, authenticated;
revoke all on function public.after_simulation_question_change() from PUBLIC, anon, authenticated;

drop trigger if exists simulation_answer_rebuild on public.simulation_user_answers;
create trigger simulation_answer_rebuild
after insert or update or delete on public.simulation_user_answers
for each row execute procedure public.after_simulation_answer_change();

drop trigger if exists simulation_vote_consensus on public.simulation_area_votes;
create trigger simulation_vote_consensus
after insert or update or delete on public.simulation_area_votes
for each row execute procedure public.after_simulation_vote_change();

drop trigger if exists simulation_question_rebuild on public.simulation_questions;
create trigger simulation_question_rebuild
after insert or update of official_answer or delete on public.simulation_questions
for each row execute procedure public.after_simulation_question_change();

alter table public.access_allowlist enable row level security;
alter table public.profiles enable row level security;
alter table public.simulation_catalog enable row level security;
alter table public.simulation_questions enable row level security;
alter table public.simulation_user_answers enable row level security;
alter table public.simulation_area_votes enable row level security;
alter table public.simulation_results enable row level security;
alter table public.simulation_manual_results enable row level security;
alter table public.university_results enable row level security;
alter table public.material_area_results enable row level security;

revoke all on table public.access_allowlist from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.simulation_catalog from anon, authenticated;
revoke all on table public.simulation_questions from anon, authenticated;
revoke all on table public.simulation_user_answers from anon, authenticated;
revoke all on table public.simulation_area_votes from anon, authenticated;
revoke all on table public.simulation_results from anon, authenticated;
revoke all on table public.simulation_manual_results from anon, authenticated;
revoke all on table public.university_results from anon, authenticated;
revoke all on table public.material_area_results from anon, authenticated;

grant select, insert, update, delete on table public.access_allowlist to authenticated;
grant select on table public.profiles to authenticated;
grant insert (id, display_name) on table public.profiles to authenticated;
grant update (display_name, updated_at) on table public.profiles to authenticated;

grant select, insert, update, delete on table public.simulation_catalog to authenticated;
grant select, insert, update, delete on table public.simulation_questions to authenticated;
grant select, insert, update, delete on table public.simulation_user_answers to authenticated;
grant select, insert, update, delete on table public.simulation_area_votes to authenticated;
grant select on table public.simulation_results to authenticated;
grant select, insert, update, delete on table public.simulation_manual_results to authenticated;
grant select, insert, update, delete on table public.university_results to authenticated;
grant select, insert, update, delete on table public.material_area_results to authenticated;

drop policy if exists access_allowlist_admin_select on public.access_allowlist;
drop policy if exists access_allowlist_admin_insert on public.access_allowlist;
drop policy if exists access_allowlist_admin_update on public.access_allowlist;
drop policy if exists access_allowlist_admin_delete on public.access_allowlist;
create policy access_allowlist_admin_select on public.access_allowlist
for select to authenticated using (public.is_peleja_admin());
create policy access_allowlist_admin_insert on public.access_allowlist
for insert to authenticated with check (public.is_peleja_admin() and desired_role = 'member');
create policy access_allowlist_admin_update on public.access_allowlist
for update to authenticated using (public.is_peleja_admin())
with check (public.is_peleja_admin() and desired_role in ('admin','member'));
create policy access_allowlist_admin_delete on public.access_allowlist
for delete to authenticated using (public.is_peleja_admin());

drop policy if exists profiles_read_authenticated on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_read_authenticated on public.profiles
for select to authenticated using (public.has_peleja_access());
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (public.has_peleja_access() and (select auth.uid()) = id and role = 'member');
create policy profiles_update_own on public.profiles
for update to authenticated
using (public.has_peleja_access() and (select auth.uid()) = id)
with check (public.has_peleja_access() and (select auth.uid()) = id);

drop policy if exists simulation_catalog_read_authenticated on public.simulation_catalog;
drop policy if exists simulation_catalog_insert_authenticated on public.simulation_catalog;
drop policy if exists simulation_catalog_admin_insert on public.simulation_catalog;
drop policy if exists simulation_catalog_admin_update on public.simulation_catalog;
drop policy if exists simulation_catalog_admin_delete on public.simulation_catalog;
create policy simulation_catalog_read_authenticated on public.simulation_catalog
for select to authenticated using (public.has_peleja_access());
create policy simulation_catalog_admin_insert on public.simulation_catalog
for insert to authenticated
with check (public.is_peleja_admin() and created_by = (select auth.uid()));
create policy simulation_catalog_admin_update on public.simulation_catalog
for update to authenticated
using (public.is_peleja_admin())
with check (public.is_peleja_admin());
create policy simulation_catalog_admin_delete on public.simulation_catalog
for delete to authenticated
using (public.is_peleja_admin());

drop policy if exists simulation_questions_read_authenticated on public.simulation_questions;
drop policy if exists simulation_questions_admin_insert on public.simulation_questions;
drop policy if exists simulation_questions_admin_update on public.simulation_questions;
drop policy if exists simulation_questions_admin_delete on public.simulation_questions;
create policy simulation_questions_read_authenticated on public.simulation_questions
for select to authenticated using (public.has_peleja_access());
create policy simulation_questions_admin_insert on public.simulation_questions
for insert to authenticated with check (public.is_peleja_admin());
create policy simulation_questions_admin_update on public.simulation_questions
for update to authenticated using (public.is_peleja_admin()) with check (public.is_peleja_admin());
create policy simulation_questions_admin_delete on public.simulation_questions
for delete to authenticated using (public.is_peleja_admin());

drop policy if exists simulation_answers_read_own on public.simulation_user_answers;
drop policy if exists simulation_answers_insert_own on public.simulation_user_answers;
drop policy if exists simulation_answers_update_own on public.simulation_user_answers;
drop policy if exists simulation_answers_delete_own on public.simulation_user_answers;
create policy simulation_answers_read_own on public.simulation_user_answers
for select to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy simulation_answers_insert_own on public.simulation_user_answers
for insert to authenticated with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy simulation_answers_update_own on public.simulation_user_answers
for update to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id) with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy simulation_answers_delete_own on public.simulation_user_answers
for delete to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id);

drop policy if exists simulation_votes_read_authenticated on public.simulation_area_votes;
drop policy if exists simulation_votes_insert_own on public.simulation_area_votes;
drop policy if exists simulation_votes_update_own on public.simulation_area_votes;
drop policy if exists simulation_votes_delete_own on public.simulation_area_votes;
create policy simulation_votes_read_authenticated on public.simulation_area_votes
for select to authenticated using (public.has_peleja_access());
create policy simulation_votes_insert_own on public.simulation_area_votes
for insert to authenticated with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy simulation_votes_update_own on public.simulation_area_votes
for update to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id) with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy simulation_votes_delete_own on public.simulation_area_votes
for delete to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id);

drop policy if exists simulation_results_read_authenticated on public.simulation_results;
drop policy if exists simulation_results_insert_own on public.simulation_results;
drop policy if exists simulation_results_update_own on public.simulation_results;
drop policy if exists simulation_results_delete_own on public.simulation_results;
create policy simulation_results_read_authenticated on public.simulation_results
for select to authenticated using (public.has_peleja_access());

drop policy if exists simulation_manual_results_read_authenticated on public.simulation_manual_results;
drop policy if exists simulation_manual_results_insert_own on public.simulation_manual_results;
drop policy if exists simulation_manual_results_update_own on public.simulation_manual_results;
drop policy if exists simulation_manual_results_delete_own on public.simulation_manual_results;
create policy simulation_manual_results_read_authenticated on public.simulation_manual_results
for select to authenticated using (public.has_peleja_access());
create policy simulation_manual_results_insert_own on public.simulation_manual_results
for insert to authenticated with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy simulation_manual_results_update_own on public.simulation_manual_results
for update to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id) with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy simulation_manual_results_delete_own on public.simulation_manual_results
for delete to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id);

drop policy if exists university_results_read_authenticated on public.university_results;
drop policy if exists university_results_insert_own on public.university_results;
drop policy if exists university_results_update_own on public.university_results;
drop policy if exists university_results_delete_own on public.university_results;
create policy university_results_read_authenticated on public.university_results
for select to authenticated using (public.has_peleja_access());
create policy university_results_insert_own on public.university_results
for insert to authenticated with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy university_results_update_own on public.university_results
for update to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id) with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy university_results_delete_own on public.university_results
for delete to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id);

drop policy if exists material_results_read_authenticated on public.material_area_results;
drop policy if exists material_results_insert_own on public.material_area_results;
drop policy if exists material_results_update_own on public.material_area_results;
drop policy if exists material_results_delete_own on public.material_area_results;
create policy material_results_read_authenticated on public.material_area_results
for select to authenticated using (public.has_peleja_access());
create policy material_results_insert_own on public.material_area_results
for insert to authenticated with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy material_results_update_own on public.material_area_results
for update to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id) with check (public.has_peleja_access() and (select auth.uid()) = user_id);
create policy material_results_delete_own on public.material_area_results
for delete to authenticated using (public.has_peleja_access() and (select auth.uid()) = user_id);

create or replace function public.enforce_invited_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.access_allowlist a
    where lower(a.email) = lower(coalesce(new.email, ''))
      and a.active
  ) then
    raise exception 'Email not invited to Peleja';
  end if;
  return new;
end;
$$;

drop trigger if exists before_auth_user_created_access_gate on auth.users;
create trigger before_auth_user_created_access_gate
before insert on auth.users
for each row execute procedure public.enforce_invited_signup();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Usuário'),
    coalesce((
      select a.desired_role
      from public.access_allowlist a
      where lower(a.email) = lower(coalesce(new.email, ''))
        and a.active
      limit 1
    ), 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$;
revoke all on function public.enforce_invited_signup() from PUBLIC, anon, authenticated;
revoke all on function public.handle_new_user() from PUBLIC, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create index if not exists simulation_results_simulation_idx on public.simulation_results(simulation_key);
create index if not exists simulation_manual_results_simulation_idx on public.simulation_manual_results(simulation_key);
create index if not exists simulation_questions_simulation_idx on public.simulation_questions(simulation_key);
create index if not exists simulation_answers_simulation_idx on public.simulation_user_answers(simulation_key);
create index if not exists simulation_votes_question_idx on public.simulation_area_votes(simulation_key, question_number);
create index if not exists university_results_exam_idx on public.university_results(exam_key);
create index if not exists university_results_area_idx on public.university_results(area);
create index if not exists material_area_results_area_idx on public.material_area_results(area);
create unique index if not exists access_allowlist_email_idx on public.access_allowlist(lower(email));
