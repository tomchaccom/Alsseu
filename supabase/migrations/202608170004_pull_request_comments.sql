create table public.pull_request_comments (
  id uuid primary key default gen_random_uuid(),
  pull_request_id uuid not null references public.pull_requests(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (
    char_length(btrim(body)) between 1 and 2000
    and body = btrim(body)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pull_request_comments_timeline_idx
  on public.pull_request_comments (pull_request_id, created_at);

create trigger pull_request_comments_set_updated_at
before update on public.pull_request_comments
for each row execute function public.set_updated_at();

alter table public.pull_request_comments enable row level security;

create policy "active members can read pull request comments"
on public.pull_request_comments for select to authenticated
using (
  exists (
    select 1
    from public.pull_requests
    where pull_requests.id = pull_request_comments.pull_request_id
      and public.is_active_study_member(pull_requests.study_id)
  )
);

create policy "active members can write their pull request comments"
on public.pull_request_comments for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.pull_requests
    join public.members
      on members.study_id = pull_requests.study_id
    where pull_requests.id = pull_request_comments.pull_request_id
      and members.id = pull_request_comments.member_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
);

grant select, insert on public.pull_request_comments to authenticated;
grant all on public.pull_request_comments to service_role;
