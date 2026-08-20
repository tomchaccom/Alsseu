# Troubleshooting

같은 실패를 반복하기 전에 이 문서를 검색한다. 새 항목은 `증상 → 재현 → 원인 → 해결 → 검증` 순서로 기록한다.

## Supabase 없이 화면이 열리지 않음

- 증상: 로컬 실행 또는 Vercel preview에서 Supabase URL/key 오류가 발생한다.
- 재현: `pnpm dev`
- 원인: 운영 모드가 켜졌지만 필수 환경 변수가 없다.
- 해결: 디자인 개발 중에는 `NEXT_PUBLIC_DEMO_MODE=true`, 실제 연동 시에는 `.env.example`의 Supabase 값을 모두 설정한다.
- 검증: `/`에서 샘플 대시보드 또는 로그인 화면이 표시되는지 확인한다.

## GitHub PR이 중복 집계됨

- 증상: 동일 PR 이벤트 재전송 후 문제 수가 증가한다.
- 재현: 같은 `X-GitHub-Delivery` 헤더로 payload를 두 번 전송한다.
- 원인: delivery 멱등성 기록 또는 PR unique key가 적용되지 않았다.
- 해결: migration의 unique constraint와 `webhook_deliveries` insert를 확인한다.
- 검증: 두 번째 요청이 `duplicate` 응답을 반환하고 PR 행 수가 그대로인지 확인한다.

## Supabase Edge Function Secrets에 SUPABASE_ prefix 등록 불가

- 증상: Secrets에 `SUPABASE_SERVICE_ROLE_KEY` 등록 시 "prefix is reserved" 오류 발생.
- 원인: Supabase가 `SUPABASE_` prefix를 예약어로 제한한다.
- 해결: `SUPABASE_SERVICE_ROLE_KEY`는 Edge Function 런타임이 자동 주입하므로 수동 등록 불필요. 다른 커스텀 시크릿은 `SUPABASE_` 없는 이름으로 등록한다.
- 검증: `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`가 함수 내에서 값을 반환하는지 로그로 확인한다.

## 첫 `supabase start`에서 health check timeout

- 증상: migration과 seed 적용 후 여러 컨테이너가 `LegacyHealthCheckTimeoutError`로 정지한다.
- 재현: Supabase 이미지를 처음 내려받은 직후 `pnpm db:start`.
- 원인: 초기 이미지 준비와 Realtime migration이 기본 2분 health timeout을 넘길 수 있다.
- 해결: `supabase/config.toml`의 `db.health_timeout`을 5분으로 유지한다. MVP에서 쓰지 않는 Realtime, Storage, Analytics는 로컬 config에서 비활성화해 필수 서비스만 기동한다.
- 검증: `pnpm db:start` 후 `pnpm exec supabase status`에서 서비스 URL이 출력되는지 확인한다.
