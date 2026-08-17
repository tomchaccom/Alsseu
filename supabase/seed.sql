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
  status
)
values
  ('11111111-1111-4111-8111-111111111111', 'algokim', '김알고', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'codepark', '박코딩', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'problemlee', '이문제', 'active'),
  ('11111111-1111-4111-8111-111111111111', 'restchoi', '최휴면', 'dormant')
on conflict (study_id, github_login) do update set
  display_name = excluded.display_name,
  status = excluded.status;
