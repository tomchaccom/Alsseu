alter table public.members
add column is_admin boolean not null default false;

update public.members as member
set is_admin = true
from public.studies as study
where member.study_id = study.id
  and study.slug = 'algo-study'
  and lower(member.github_login) = 'tomchaccom';

create or replace function public.is_study_admin(target_study_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members
    where study_id = target_study_id
      and user_id = auth.uid()
      and status = 'active'
      and is_admin = true
  );
$$;

revoke all on function public.is_study_admin(uuid) from public;
grant execute on function public.is_study_admin(uuid) to authenticated;

create or replace function public.set_member_status(
  target_member_id uuid,
  target_status public.member_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_study_id uuid;
  target_user_id uuid;
begin
  select study_id, user_id
  into target_study_id, target_user_id
  from public.members
  where id = target_member_id;

  if target_study_id is null then
    return false;
  end if;

  if not public.is_study_admin(target_study_id) then
    raise exception 'study admin permission required'
      using errcode = '42501';
  end if;

  if target_user_id = auth.uid() and target_status = 'dormant' then
    raise exception 'an admin cannot make their own account dormant'
      using errcode = '42501';
  end if;

  update public.members
  set status = target_status
  where id = target_member_id
    and study_id = target_study_id;

  return found;
end;
$$;

revoke all on function public.set_member_status(uuid, public.member_status) from public;
grant execute on function public.set_member_status(uuid, public.member_status) to authenticated;
