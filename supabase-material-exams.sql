-- Aggregate question results by faculty exam type; never expose private entries.
begin;
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.material_exam_results()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  with catalog as (
    select payload from public.academic_catalog where id
  ), exams as (
    select upper(btrim(e->>'type')) exam_type,e->'materialIds' ids
    from catalog c cross join lateral jsonb_array_elements(c.payload->'exams') e
    where coalesce(btrim(e->>'type'),'')<>''
  ), links as (
    select distinct e.exam_type,m->>'id' material_id,
      public.peleja_area(m->>'area',m->>'subject') area
    from exams e cross join catalog c
    cross join lateral jsonb_array_elements(c.payload->'materials') m
    where coalesce(e.ids,'[]') ? (m->>'id')
  ), entries as (
    select h.user_id,l.exam_type,l.area,q
    from public.account_handles h join public.user_workspace w on w.user_id=h.user_id
    cross join lateral jsonb_array_elements(coalesce(w.payload->'materials','[]')) m
    join links l on l.material_id=m->>'id'
    cross join lateral jsonb_array_elements(coalesce(m->'questionEntries','[]')) q
    where h.active
  ), totals as (
    select user_id,exam_type,area,sum((q->>'questions')::bigint) total,
      sum((q->>'correct')::bigint) correct,sum((q->>'wrong')::bigint) wrong
    from entries group by user_id,exam_type,area
  )
  select jsonb_build_object(
    'types',(select coalesce(jsonb_agg(exam_type order by exam_type),'[]') from (select distinct exam_type from exams) t),
    'rows',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from totals t where total>0)
  ) into result;
  return result;
end;
$$;
revoke all on function private.material_exam_results() from public,anon;
grant execute on function private.material_exam_results() to authenticated;
create or replace function public.material_exam_results()
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.material_exam_results(); $$;
revoke all on function public.material_exam_results() from public,anon;
grant execute on function public.material_exam_results() to authenticated;
commit;
