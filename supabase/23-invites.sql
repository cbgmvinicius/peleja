-- Invites carry the member's handle and name, so a new account joins the rankings and the Painel by itself.
-- Run once in the Supabase SQL editor. Afterwards, inviting someone is a row in access_allowlist.
alter table public.access_allowlist add column if not exists desired_handle text check (desired_handle is null or desired_handle ~ '^[a-z0-9_]{2,30}$');
alter table public.access_allowlist add column if not exists desired_name text check (desired_name is null or length(btrim(desired_name)) between 1 and 80);
alter table public.account_handles drop constraint if exists account_handles_username_check;
alter table public.account_handles add constraint account_handles_username_check check (username ~ '^[a-z0-9_]{2,30}$');

create or replace function public.assign_invited_handle() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.access_allowlist;
begin
 select * into a from public.access_allowlist where lower(email)=lower(coalesce(new.email,'')) and active;
 if a.desired_handle is not null then
  insert into public.account_handles(user_id,username,active) values(new.id,a.desired_handle,true) on conflict do nothing;
 end if;
 if a.desired_name is not null then
  update public.profiles set display_name=a.desired_name where id=new.id;
 end if;
 return new;
end;$$;
revoke all on function public.assign_invited_handle() from public,anon,authenticated;
-- "zz_" so it runs after the trigger that creates the profile.
drop trigger if exists zz_peleja_assign_handle on auth.users;
create trigger zz_peleja_assign_handle after insert on auth.users for each row execute procedure public.assign_invited_handle();

-- To invite someone (emails stay out of this public repository; run it in the SQL editor):
-- insert into public.access_allowlist(email,desired_role,active,desired_handle,desired_name)
-- values ('pessoa@exemplo.com','member',true,'pessoa','Pessoa')
-- on conflict (email) do update set active=true,desired_handle=excluded.desired_handle,desired_name=excluded.desired_name;
