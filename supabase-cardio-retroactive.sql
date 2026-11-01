-- Two approved exam weeks: 2026-10-19 through 2026-11-01.
-- Changes schedule only; watched history is untouched. Re-runnable.
CREATE OR REPLACE FUNCTION public.study_progress_next(p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  if p_day is null then raise exception 'Data obrigatória'; end if;
  with schedule(id,day) as (values ('ecg-m01-01',date '2026-09-27'),('ecg-m01-02',date '2026-09-28'),('ecg-m01-03',date '2026-09-29'),('ecg-m02-01',date '2026-09-30'),('ecg-m02-02',date '2026-10-01'),('ecg-m02-03',date '2026-10-02'),('ecg-m02-04',date '2026-10-03'),('ecg-m02-05',date '2026-10-04'),('ecg-m02-06',date '2026-10-05'),('ecg-m03-01',date '2026-10-06'),('ecg-m04-01',date '2026-10-07'),('ecg-m04-02',date '2026-10-08'),('ecg-m04-03',date '2026-10-09'),('ecg-m05-01',date '2026-10-10'),('ecg-m05-02',date '2026-10-11'),('ecg-m06-01',date '2026-10-12'),('ecg-m06-02',date '2026-10-13'),('ecg-m06-03',date '2026-10-14'),('ecg-m06-04',date '2026-10-15'),('ecg-m06-05',date '2026-10-16'),('ecg-m06-06',date '2026-10-17'),('ecg-m06-07',date '2026-10-18'),('ecg-m06-08',date '2026-11-02'),('ecg-m06-09',date '2026-11-03'),('ecg-m06-10',date '2026-11-04'),('ecg-m06-11',date '2026-11-05'),('ecg-m06-12',date '2026-11-06'),('ecg-m07-01',date '2026-11-07'),('ecg-m07-02',date '2026-11-08'),('ecg-m08-01',date '2026-11-09'),('ecg-m08-02',date '2026-11-10'),('ecg-m08-03',date '2026-11-11'),('ecg-m08-04',date '2026-11-12'),('ecg-m08-05',date '2026-11-13'),('ecg-m08-06',date '2026-11-14'),('ecg-m08-07',date '2026-11-15'),('ecg-m08-08',date '2026-11-16'),('ecg-m08-09',date '2026-11-17'),('ecg-m08-10',date '2026-11-18'),('ecg-m08-11',date '2026-11-19'),('ecg-m09-01',date '2026-11-20'),('ecg-m09-02',date '2026-11-21'),('ecg-m10-01',date '2026-11-22'),('ecg-m11-01',date '2026-11-23'),('ecg-m11-02',date '2026-11-24'),('ecg-m11-03',date '2026-11-25'),('ecg-m11-04',date '2026-11-26'),('ecg-m11-05',date '2026-11-27'),('ecg-m11-06',date '2026-11-28'),('ecg-m11-07',date '2026-11-29'),('ecg-m11-08',date '2026-11-30'),('ecg-m11-09',date '2026-12-01'),('ecg-m11-10',date '2026-12-02'),('ecg-m11-11',date '2026-12-03'),('ecg-m11-12',date '2026-12-04'),('ecg-m11-13',date '2026-12-05'),('ecg-m11-14',date '2026-12-06'),('ecg-m11-15',date '2026-12-07'),('ecg-m11-16',date '2026-12-08'),('ecg-m11-17',date '2026-12-09'),('ecg-m11-18',date '2026-12-10'),('ecg-m11-19',date '2026-12-11'),('ecg-m11-20',date '2026-12-12'),('ecg-m11-21',date '2026-12-13'),('ecg-m11-22',date '2026-12-14'),('ecg-m11-23',date '2026-12-15'),('ecg-m11-24',date '2026-12-16'),('ecg-m11-25',date '2026-12-17'),('ecg-m11-26',date '2026-12-18'),('ecg-m11-27',date '2026-12-19'),('ecg-m11-28',date '2026-12-20'),('ecg-m11-29',date '2026-12-21'),('ecg-m11-30',date '2026-12-22'),('ecg-m11-31',date '2026-12-23'),('ecg-m11-32',date '2026-12-24'),('ecg-m11-33',date '2026-12-25'),('ecg-m11-34',date '2026-12-26'),('ecg-m11-35',date '2026-12-27'),('ecg-m12-01',date '2026-12-28'),('ecg-m12-02',date '2026-12-29'),('ecg-m12-03',date '2026-12-30'),('ecg-m12-04',date '2026-12-31'),('ecg-m13-01',date '2027-01-01'),('ecg-m13-02',date '2027-01-02'),('ecg-m13-03',date '2027-01-03'),('ecg-m13-04',date '2027-01-04'),('ecg-m14-01',date '2027-01-05'),('ecg-m14-02',date '2027-01-06'),('ecg-m14-03',date '2027-01-07'),('ecg-m14-04',date '2027-01-08'),('ecg-m14-05',date '2027-01-09'),('ecg-m14-06',date '2027-01-10'),('ecg-m14-07',date '2027-01-11'),('ecg-m14-08',date '2027-01-12'),('ecg-m15-01',date '2027-01-13'),('ecg-m16-01',date '2027-01-14'),('ecg-m16-02',date '2027-01-15'),('ecg-m16-03',date '2027-01-16'),('ecg-m16-04',date '2027-01-17'),('ecg-m16-05',date '2027-01-18'),('ecg-m16-06',date '2027-01-19'),('ecg-m16-07',date '2027-01-20'),('ecg-m16-08',date '2027-01-21'),('ecg-m16-09',date '2027-01-22'),('ecg-m16-10',date '2027-01-23'),('ecg-m16-11',date '2027-01-24'),('ecg-m17-01',date '2027-01-25'),('ecg-m17-02',date '2027-01-26'),('ecg-m17-03',date '2027-01-27'),('ecg-m17-04',date '2027-01-28'),('ecg-m17-05',date '2027-01-29'),('ecg-m17-06',date '2027-01-30'),('ecg-m17-07',date '2027-01-31'),('ecg-m17-08',date '2027-02-01'),('ecg-m17-09',date '2027-02-02'),('ecg-m17-10',date '2027-02-03'),('ecg-m17-11',date '2027-02-04'),('ecg-m17-12',date '2027-02-05'),('ecg-m17-13',date '2027-02-06'),('ecg-m17-14',date '2027-02-07'),('ecg-m17-15',date '2027-02-08')), members as (
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
        where exists(select 1 from schedule s where s.id=x->>'id' and s.day<=p_day)) course_done
    from members m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',c.user_id,'name',c.name,'has_data',c.payload is not null,'updated_at',c.updated_at,
    'materials',jsonb_build_object('done',c.done,'total',c.total),
    'next',jsonb_build_object('done',c.next_done,'total',c.next_total,'date',n.exam_day,
      'exams',(select coalesce(jsonb_agg(p.subject||' · '||p.type order by p.subject,p.type),'[]') from pending p where p.user_id=c.user_id and p.exam_day=n.exam_day)),
    'courses',jsonb_build_object('done',c.course_done,'total',(select count(*) from schedule where day<=p_day))
  ) order by c.name),'[]') into result from counts c left join nearest n using(user_id);
  return result;
end;
$function$
;


revoke all on function public.study_progress_next(date) from public, anon;
grant execute on function public.study_progress_next(date) to authenticated;
