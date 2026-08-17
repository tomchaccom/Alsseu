# AGENT.md — 알고공부 MVP 개발 하네스

이 문서는 Codex, Claude Code 등 모든 개발 에이전트가 공유하는 프로젝트 진입점이다. 세부 아키텍처는 `docs/PROJECT_CONTEXT.md`, 운영 장애 기록은 `docs/TROUBLESHOOTING.md`, 협업 규칙은 `CONTRIBUTING.md`를 참조한다.

## 제품 한 줄 정의

GitHub 원본 레포의 PR을 주간 문제 풀이로 집계해 팀 진행률과 마감 후 벌금 대상을 보여주고, 마감 3시간 전에 Discord로 미달 인원을 알리는 알고리즘 스터디 대시보드.

## MVP 불변식

- 주간 구간은 `Asia/Seoul` 기준 월요일 00:00:00부터 일요일 23:59:59까지다.
- 할당량은 의도적으로 주당 5문제로 고정한다.
- 원본 레포에 **merge된 PR 1개를 문제 1개**로 센다. open PR이나 fork 커밋은 세지 않는다.
- 휴면 멤버는 진행률과 벌금 대상에서 제외한다.
- 마감 3시간 전 알림은 주간 구간마다 한 번만 전송한다.
- 벌금은 납부 상태를 추적하지 않는다. 대상자와 카카오 모임통장 링크만 제공한다.
- 완료 슬롯에서 실제 PR의 문제 README와 풀이 코드를 열고, 활성 스터디원끼리 전체 댓글과 코드 라인 댓글을 남긴다.
- GitHub 댓글 동기화, 댓글 수정·삭제, 랭킹, 결제 추적, 멀티 스터디 UI는 MVP 밖이다.

## 기술 스택과 서비스 경계

- Web: Next.js 16 App Router, React 19, TypeScript strict, CSS Modules/Global CSS
- Auth/Data: Supabase Auth(GitHub OAuth), Postgres, RLS
- Ingest/Jobs: Supabase Edge Functions, Supabase Cron
- Integrations: GitHub Webhook, Discord Webhook, 카카오 모임통장 외부 링크
- Deploy: Vercel(Web), Supabase(데이터·함수·Cron)
- Test: Vitest, Testing Library

브라우저에는 Supabase publishable key만 노출한다. service role key, GitHub webhook secret, Discord webhook URL은 Edge Function 또는 서버 환경에만 둔다.

## 핵심 파일 지도

| 변경 대상 | 먼저 읽을 파일 |
|---|---|
| 주간 집계·벌금 규칙 | `src/domain/study.ts`, `src/domain/study.test.ts` |
| 대시보드 데이터 | `src/lib/dashboard-data.ts`, `src/lib/sample-data.ts` |
| UI·디자인 | `src/components/dashboard-shell.tsx`, `src/app/globals.css` |
| 인증 | `src/lib/supabase/*`, `src/app/login`, `src/app/auth/callback` |
| DB/RLS | `supabase/migrations/*` |
| GitHub 수집 | `supabase/functions/github-webhook/index.ts` |
| PR 파일·댓글 | `src/app/api/pull-requests/[id]/route.ts`, `src/lib/github-pr-details.ts` |
| Discord 알림 | `supabase/functions/discord-reminder/index.ts` |
| 배포·환경변수 | `.env.example`, `README.md` |

## 아키텍처 규칙

1. 비즈니스 시간 계산과 대상자 선정은 `src/domain`의 순수 함수로 유지한다.
2. Server Component가 데이터를 읽고, Client Component는 탭·모달 등 상호작용만 담당한다.
3. UI에서 카운트를 다시 추측하지 말고 도메인이 계산한 `progress`를 표시한다.
4. 외부 webhook은 서명 검증과 delivery id 멱등성 확인 후 DB를 변경한다.
5. RLS를 끄거나 service role key를 클라이언트에 노출하는 방식으로 인증 문제를 우회하지 않는다.
6. 실제 연동 값이 없을 때는 데모 모드로 빌드 가능해야 하며, 운영에서는 `NEXT_PUBLIC_DEMO_MODE=false`로 명시한다.
7. Next.js API를 사용할 때는 현재 설치 버전의 `node_modules/next/dist/docs/` 문서를 먼저 확인한다.
8. PR 댓글은 `pull_request_comments` RLS로 읽기·쓰기를 활성 스터디원에게만 허용하고, GitHub OAuth 토큰은 서버 경계 밖으로 내보내지 않는다.
9. 첫 대시보드 조회에서 이번 주·직전 주차 집계를 함께 내려 탭을 클라이언트에서 즉시 전환한다. 공개 GitHub PR 문제·코드 원문은 첫 렌더 후 별도 예열 API가 비동기로 요청해 14일간 저장하고, 세션·RLS 결과·댓글은 캐시하지 않는다.

## 작업 루프

1. 요청과 MVP 불변식을 대조해 범위를 고정한다.
2. 관련 파일과 기존 테스트를 먼저 읽는다.
3. 실패 또는 기대 동작을 테스트 사례로 정의한다.
4. 가장 작은 범위로 구현한다.
5. `pnpm verify`를 실행한다.
6. 외부 연동 변경은 로컬 검증 한계와 필요한 시크릿을 README에 남긴다.

## 완료 기준

```bash
pnpm verify
```

위 명령이 lint → typecheck → unit/component test → production build 순으로 모두 통과해야 한다. UI 변경은 데스크톱과 모바일 폭에서 직접 확인한다. Supabase 변경은 가능하면 `pnpm db:reset`으로 migration/seed를 검증한다.

## 문제 해결 기록

실패 시 같은 조치를 반복하지 않는다. `docs/TROUBLESHOOTING.md`를 먼저 확인하고, 새 문제라면 다음 형식으로 추가한다.

```text
증상 → 재현 명령 → 원인 → 해결 → 검증 명령
```
