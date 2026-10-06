-- Run after supabase-upgrade.sql. Keeps photos private to active Peleja accounts.
begin;
create table if not exists public.profile_photos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  image_data text not null check (length(image_data) <= 60000 and image_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$')
);
alter table public.profile_photos enable row level security;
revoke all on public.profile_photos from anon, authenticated;
grant select on public.profile_photos to authenticated;
drop policy if exists photos_members on public.profile_photos;
create policy photos_members on public.profile_photos for select to authenticated using(public.has_peleja_access());
create or replace function public.save_profile_photo(image_data text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_peleja_access() then raise exception 'Acesso negado'; end if;
  if image_data is null then
    delete from public.profile_photos where user_id=auth.uid();
  else
    insert into public.profile_photos(user_id,image_data) values(auth.uid(),image_data)
    on conflict(user_id) do update set image_data=excluded.image_data;
  end if;
end;
$$;
revoke all on function public.save_profile_photo(text) from public,anon;
grant execute on function public.save_profile_photo(text) to authenticated;
commit;
