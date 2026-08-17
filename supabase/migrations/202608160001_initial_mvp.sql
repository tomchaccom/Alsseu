create extension if not exists pgcrypto;

create type public.member_status as enum ('active', 'dormant');
create type public.notification_status as enum ('pending', 'sent', 'skipped', 'failed');

create table public.studies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  github_owner text not null,
  github_repo text not null,
  weekly_quota smallint not null default 5 check (weekly_quota = 5),
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'),
  kakao_pay_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (github_owner, github_repo)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  github_login text not null,
  display_name text not null,
  avatar_url text,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (study_id, github_login),
  unique (study_id, user_id)
);

create table public.pull_requests (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies(id) on delete cascade,
  github_pr_number integer not null,
  github_node_id text not null,
  github_login text not null,
  title text not null,
  html_url text not null,
  head_branch text not null,
  state text not null check (state in ('open', 'closed', 'merged')),
  opened_at timestamptz not null,
  merged_at timestamptz,
  additions integer not null default 0 check (additions >= 0),
  deletions integer not null default 0 check (deletions >= 0),
  changed_files integer not null default 0 check (changed_files >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (study_id, github_pr_number),
  unique (study_id, github_node_id)
);

create index pull_requests_weekly_progress_idx
  on public.pull_requests (study_id, merged_at, github_login)
  where merged_at is not null;

create table public.webhook_deliveries (
  delivery_id text primary key,
  event_name text not null,
  repository_full_name text not null,
  processed_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies(id) on delete cascade,
  week_start date not null,
  kind text not null check (kind = 'deadline_3h'),
  status public.notification_status not null,
  target_logins jsonb not null default '[]'::jsonb,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (study_id, week_start, kind)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger studies_set_updated_at
before update on public.studies
for each row execute function public.set_updated_at();

create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

create trigger pull_requests_set_updated_at
before update on public.pull_requests
for each row execute function public.set_updated_at();

create trigger notification_deliveries_set_updated_at
before update on public.notification_deliveries
for each row execute function public.set_updated_at();

create or replace function public.is_active_study_member(target_study_id uuid)
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
  );
$$;

revoke all on function public.is_active_study_member(uuid) from public;
grant execute on function public.is_active_study_member(uuid) to authenticated;

alter table public.studies enable row level security;
alter table public.members enable row level security;
alter table public.pull_requests enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "active members can read their study"
on public.studies for select to authenticated
using (public.is_active_study_member(id));

create policy "active members can read study members"
on public.members for select to authenticated
using (public.is_active_study_member(study_id));

create policy "active members can read study pull requests"
on public.pull_requests for select to authenticated
using (public.is_active_study_member(study_id));

create policy "active members can read notification status"
on public.notification_deliveries for select to authenticated
using (public.is_active_study_member(study_id));

grant usage on schema public to authenticated, service_role;
grant select on public.studies, public.members, public.pull_requests, public.notification_deliveries to authenticated;
grant all on public.studies, public.members, public.pull_requests, public.webhook_deliveries, public.notification_deliveries to service_role;
