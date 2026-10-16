-- Only aggregate study progress is shared with active Peleja participants.
begin;
create or replace function public.study_progress(p_day date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  if p_day is null then raise exception 'Data obrigatória'; end if;
  with members as (
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
        own->'performed'='true'::jsonb
        or case when jsonb_typeof(own->'grade')='number' then (own->>'grade')::numeric between 0 and 10 else false end
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
        where x->>'id'=any(array['ecg-m01-01','ecg-m01-02','ecg-m01-03','ecg-m02-01','ecg-m02-02','ecg-m02-03','ecg-m02-04','ecg-m02-05','ecg-m02-06','ecg-m03-01','ecg-m04-01','ecg-m04-02','ecg-m04-03','ecg-m05-01','ecg-m05-02','ecg-m06-01','ecg-m06-02','ecg-m06-03','ecg-m06-04','ecg-m06-05','ecg-m06-06','ecg-m06-07','ecg-m06-08','ecg-m06-09','ecg-m06-10','ecg-m06-11','ecg-m06-12','ecg-m07-01','ecg-m07-02','ecg-m08-01','ecg-m08-02','ecg-m08-03','ecg-m08-04','ecg-m08-05','ecg-m08-06','ecg-m08-07','ecg-m08-08','ecg-m08-09','ecg-m08-10','ecg-m08-11','ecg-m09-01','ecg-m09-02','ecg-m10-01','ecg-m11-01','ecg-m11-02','ecg-m11-03','ecg-m11-04','ecg-m11-05','ecg-m11-06','ecg-m11-07','ecg-m11-08','ecg-m11-09','ecg-m11-10','ecg-m11-11','ecg-m11-12','ecg-m11-13','ecg-m11-14','ecg-m11-15','ecg-m11-16','ecg-m11-17','ecg-m11-18','ecg-m11-19','ecg-m11-20','ecg-m11-21','ecg-m11-22','ecg-m11-23','ecg-m11-24','ecg-m11-25','ecg-m11-26','ecg-m11-27','ecg-m11-28','ecg-m11-29','ecg-m11-30','ecg-m11-31','ecg-m11-32','ecg-m11-33','ecg-m11-34','ecg-m11-35','ecg-m12-01','ecg-m12-02','ecg-m12-03','ecg-m12-04','ecg-m13-01','ecg-m13-02','ecg-m13-03','ecg-m13-04','ecg-m14-01','ecg-m14-02','ecg-m14-03','ecg-m14-04','ecg-m14-05','ecg-m14-06','ecg-m14-07','ecg-m14-08','ecg-m15-01','ecg-m16-01','ecg-m16-02','ecg-m16-03','ecg-m16-04','ecg-m16-05','ecg-m16-06','ecg-m16-07','ecg-m16-08','ecg-m16-09','ecg-m16-10','ecg-m16-11','ecg-m17-01','ecg-m17-02','ecg-m17-03','ecg-m17-04','ecg-m17-05','ecg-m17-06','ecg-m17-07','ecg-m17-08','ecg-m17-09','ecg-m17-10','ecg-m17-11','ecg-m17-12','ecg-m17-13','ecg-m17-14','ecg-m17-15','ecg-extra-01','ecg-extra-02','ecg-extra-03','ecg-extra-04','ecg-extra-05','ecg-extra-06','ecg-extra-07']::text[])) course_done
    from members m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',c.user_id,'name',c.name,'has_data',c.payload is not null,'updated_at',c.updated_at,
    'materials',jsonb_build_object('done',c.done,'total',c.total),
    'next',jsonb_build_object('done',c.next_done,'total',c.next_total,'date',n.exam_day,
      'exams',(select coalesce(jsonb_agg(p.subject||' · '||p.type order by p.subject,p.type),'[]') from pending p where p.user_id=c.user_id and p.exam_day=n.exam_day)),
    'courses',jsonb_build_object('done',c.course_done,'total',128)
  ) order by c.name),'[]') into result from counts c left join nearest n using(user_id);
  return result;
end;
$$;
revoke all on function public.study_progress(date) from public,anon;
grant execute on function public.study_progress(date) to authenticated;
commit;
