# 알고공부

GitHub 원본 레포의 merge PR을 주간 문제 풀이로 집계하는 알고리즘 스터디 웹앱 MVP입니다. 팀원은 이번 주 5문제 진행률과 PR 상세를 확인하고, 마감 후 벌금 대상과 카카오 모임통장 링크를 볼 수 있습니다. 미달 멤버에게는 일요일 21:00(KST)에 Discord 알림을 한 번 전송합니다.

## 현재 구현 범위

- 반응형 주간 대시보드와 PR 상세 모달
- 마감 상태, 5문제 슬롯, 마감 후 벌금 대상 표시
- Supabase GitHub OAuth 및 RLS 골격
- GitHub webhook 수집 Edge Function
- Discord 3시간 전 알림 Edge Function과 Cron 예시
- Supabase migration/seed, Vercel 배포 가능한 Next.js 빌드
- 환경 변수 없이 확인 가능한 데모 모드

회원 관리 UI, 납부 상태 추적, 코드 코멘트, 랭킹, 멀티 스터디는 MVP에 포함하지 않습니다.

## 로컬 실행

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`NEXT_PUBLIC_DEMO_MODE=true`이면 별도 백엔드 없이 샘플 데이터를 사용합니다. `/`에서 `?state=warning`, `?state=closed`, `?state=complete`를 붙이면 주요 화면 상태를 확인할 수 있습니다.

전체 검증:

```bash
pnpm verify
```

## Supabase 로컬 개발

Docker가 실행 중인 상태에서:

```bash
pnpm db:start
pnpm db:reset
pnpm functions:serve
```

`supabase/.env.local`에는 `.env.example`의 Edge Function secret을 넣습니다. 이 파일은 커밋하지 않습니다.

## 운영 연동

1. Supabase 프로젝트에 `supabase/migrations`를 적용합니다.
2. GitHub OAuth provider를 켜고 `https://<app-domain>/auth/callback`을 redirect URL로 등록합니다.
3. `studies`, `members`를 등록하고 멤버의 `user_id`를 Supabase Auth 사용자와 연결합니다.
4. `github-webhook`, `discord-reminder` Edge Function을 배포하고 secret을 설정합니다.
5. GitHub 원본 레포의 Webhook URL을 `https://<project-ref>.supabase.co/functions/v1/github-webhook`으로 등록하고 Pull requests 이벤트만 선택합니다.
6. `supabase/cron/discord-reminder.sql`의 placeholder를 교체해 SQL Editor에서 실행합니다.
7. Vercel에 `NEXT_PUBLIC_DEMO_MODE=false`와 `.env.example`의 Web 환경 변수를 등록합니다.

GitHub는 `pull_request` payload의 `repository.full_name`이 `studies.github_owner/github_repo`와 일치할 때만 저장합니다. 문제 수는 `merged_at`이 해당 주차 안에 있는 PR만 셉니다.
