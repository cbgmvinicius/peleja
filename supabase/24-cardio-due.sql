-- CardioPapers goal in the Painel ranking: the same schedule for everyone.
-- The browser computes the schedule (approved pause + no new lesson in exam weeks, extra-courses.js) and sends
-- the IDs due until p_day; every member's total and done count over exactly those lessons.
-- The one-argument version stays for pages still open with the old code. Re-runnable.
CREATE OR REPLACE FUNCTION public.study_progress_next(p_day date,p_due text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  if p_day is null then raise exception 'Data obrigatória'; end if;
  if p_due is null or cardinality(p_due)>1000 then raise exception 'Aulas inválidas'; end if;
  with due as (
    select distinct id from unnest(p_due) id where id is not null and length(id) between 1 and 80
), members as (
    select h.user_id,coalesce(p.display_name,h.username) as name,w.payload,w.updated_at
    from public.account_handles h left join public.profiles p on p.id=h.user_id
    left join public.user_workspace w on w.user_id=h.user_id where h.active
  ), catalog as (
    select payload from public.academic_catalog where id
  ), pending as (
    select m.user_id,e->>'id' id,e->>'date' exam_day,e->>'subject' subject,e->>'type' type,e->'materialIds' materials
    from members m cross join catalog c cross join lateral jsonb_array_elements(c.payload->'exams') e
    where (coalesce(e->>'date','')='' or e->>'date'>=p_day::text)
    and not exists (
      select 1 from jsonb_array_elements(coalesce(m.payload->'exams','[]')) own
      where own->>'id'=e->>'id' and (
        case when jsonb_typeof(own->'grade')='number' then (own->>'grade')::numeric between 0 and 10 else false end
        or case when jsonb_typeof(own->'total')='number' and jsonb_typeof(own->'correct')='number' and jsonb_typeof(own->'wrong')='number'
          then (own->>'total')::numeric>0 and (own->>'correct')::numeric+(own->>'wrong')::numeric=(own->>'total')::numeric else false end
      )
    )
  ), nearest as (
    select user_id,min(nullif(exam_day,'')) exam_day from pending group by user_id
  ), material_sets as (
    select distinct p.user_id,ids.value #>> '{}' as material_id,
      n.exam_day is not null and p.exam_day=n.exam_day as is_next
    from pending p left join nearest n using(user_id)
    cross join lateral jsonb_array_elements(coalesce(p.materials,'[]')) ids
    where exists(select 1 from catalog c,jsonb_array_elements(c.payload->'materials') item where item->>'id'=ids.value #>> '{}')
  ), material_ids as (
    select user_id,material_id,bool_or(is_next) is_next from material_sets group by user_id,material_id
  ), counts as (
    select m.*,
      (select count(*) from material_ids i where i.user_id=m.user_id) total,
      (select count(*) from material_ids i where i.user_id=m.user_id and i.is_next) next_total,
      (select count(*) from material_ids i where i.user_id=m.user_id and exists(
        select 1 from jsonb_array_elements(coalesce(m.payload->'materials','[]')) own where own->>'id'=i.material_id and own->'read'='true'::jsonb)) done,
      (select count(*) from material_ids i where i.user_id=m.user_id and i.is_next and exists(
        select 1 from jsonb_array_elements(coalesce(m.payload->'materials','[]')) own where own->>'id'=i.material_id and own->'read'='true'::jsonb)) next_done,
      (select count(distinct x->>'id') from jsonb_array_elements(coalesce(m.payload->'courses','[]')) x
        where exists(select 1 from due d where d.id=x->>'id')) course_done
    from members m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',c.user_id,'name',c.name,'has_data',c.payload is not null,'updated_at',c.updated_at,
    'materials',jsonb_build_object('done',c.done,'total',c.total),
    'next',jsonb_build_object('done',c.next_done,'total',c.next_total,'date',n.exam_day,
      'exams',(select coalesce(jsonb_agg(p.subject||' · '||p.type order by p.subject,p.type),'[]') from pending p where p.user_id=c.user_id and p.exam_day=n.exam_day)),
    'courses',jsonb_build_object('done',c.course_done,'total',(select count(*) from due))
  ) order by c.name),'[]') into result from counts c left join nearest n using(user_id);
  return result;
end;
$function$
;

revoke all on function public.study_progress_next(date,text[]) from public, anon;
grant execute on function public.study_progress_next(date,text[]) to authenticated;
