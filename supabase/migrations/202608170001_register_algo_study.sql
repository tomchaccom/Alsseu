insert into public.studies (
  id,
  name,
  slug,
  github_owner,
  github_repo,
  kakao_pay_url
)
values (
  '11111111-1111-4111-8111-111111111111',
  '알쓰 알고리즘 스터디',
  'algo-study',
  'algo-gongbu',
  'algo-study',
  'https://link.kakaopay.com/'
)
on conflict (slug) do update set
  name = excluded.name,
  github_owner = excluded.github_owner,
  github_repo = excluded.github_repo,
  kakao_pay_url = excluded.kakao_pay_url;

insert into public.members (
  study_id,
  github_login,
  display_name,
  avatar_url,
  status
)
values
  ('11111111-1111-4111-8111-111111111111', 'sungjaep11', 'Sungjae Park', 'https://avatars.githubusercontent.com/u/98754301?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'tomchaccom', 'Kirby', 'https://avatars.githubusercontent.com/u/134512691?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'LYoooJ', 'Yoojin Lim', 'https://avatars.githubusercontent.com/u/160727704?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'onff02', 'onff02', 'https://avatars.githubusercontent.com/u/165152345?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'alicebsy', '배서연', 'https://avatars.githubusercontent.com/u/169745746?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'Nul0luN', 'Yeongun Choi', 'https://avatars.githubusercontent.com/u/192510957?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'gun9212', '이건', 'https://avatars.githubusercontent.com/u/199911220?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'KangYeSeo04', 'KangYeSeo04', 'https://avatars.githubusercontent.com/u/202237973?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'hjxarchive', 'Hanjin Tak', 'https://avatars.githubusercontent.com/u/203686861?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'haeunjeon0410', 'haeunjeon0410', 'https://avatars.githubusercontent.com/u/204126593?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'godten-cmd', '신원영', 'https://avatars.githubusercontent.com/u/205764465?v=4', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'orca-svg', 'orca', 'https://avatars.githubusercontent.com/u/233767251?v=4', 'active')
on conflict (study_id, github_login) do update set
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url,
  status = excluded.status;

create or replace function public.link_current_github_member()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_login text;
  linked_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select coalesce(
    nullif(identity_data ->> 'user_name', ''),
    nullif(identity_data ->> 'preferred_username', ''),
    nullif(identity_data ->> 'login', '')
  )
  into identity_login
  from auth.identities
  where user_id = auth.uid()
    and provider = 'github'
  order by created_at
  limit 1;

  if identity_login is null then
    return false;
  end if;

  update public.members
  set user_id = auth.uid()
  where lower(public.members.github_login) = lower(identity_login)
    and (user_id is null or user_id = auth.uid());

  get diagnostics linked_count = row_count;
  return linked_count > 0;
end;
$$;

revoke all on function public.link_current_github_member() from public;
grant execute on function public.link_current_github_member() to authenticated;

update public.members as member
set user_id = identity.user_id
from auth.identities as identity
where identity.provider = 'github'
  and member.user_id is null
  and lower(member.github_login) = lower(coalesce(
    nullif(identity.identity_data ->> 'user_name', ''),
    nullif(identity.identity_data ->> 'preferred_username', ''),
    nullif(identity.identity_data ->> 'login', '')
  ));
