# 프로젝트 컨텍스트

## 런타임 흐름

```text
GitHub 원본 레포 PR 이벤트
  → github-webhook Edge Function (서명·멱등성 검증)
  → Supabase pull_requests
  → Next.js Server Component가 studies/members/pull_requests 조회
  → 주간 진행률 및 벌금 대상 계산
  → 대시보드 렌더링

완료된 문제 슬롯 클릭
  → Next.js Route Handler가 세션·RLS 확인
  → GitHub PR에서 README·풀이 파일 조회 후 14일 서버 캐시
  → Supabase pull_request_comments 전체·파일·라인 댓글 조회·저장
  → 왼쪽 문제 설명·오른쪽 코드와 인라인 댓글 표시

대시보드 최초 조회
  → 이번 주·직전 주차 merged PR 목록과 집계를 함께 전달
  → 주차 탭은 추가 서버 요청 없이 클라이언트에서 즉시 전환
첫 렌더 완료 1초 후
  → 별도 예열 API를 한 번 호출
  → 응답 완료 후 GitHub 문제·코드 캐시를 비동기로 채우기
  → PR 상세 클릭 시 캐시 우선 응답

Supabase Cron (일요일 21:00 KST)
  → discord-reminder Edge Function
  → 활성 멤버 중 merge PR 5개 미만 선별
  → Discord Webhook 1회 전송
```

## 데이터 책임

- `studies`: 레포, 주간 할당량, 카카오 링크 같은 스터디 설정
- `members`: GitHub 로그인과 활성/휴면 상태. 0문제 멤버를 누락하지 않는 기준 목록
- `pull_requests`: GitHub webhook으로 수집한 원본 레포 PR 스냅샷
- `pull_request_comments`: PR별 Alsseu 내부 댓글. nullable `file_path`/`line_number`로 전체 댓글과 코드 라인 댓글을 구분하고, 작성자 `auth.uid()`와 활성 멤버십을 RLS로 검증
- `webhook_deliveries`: GitHub 재전송 멱등성
- `notification_deliveries`: 주차별 Discord 중복 발송 방지 및 실패 기록

## 인증과 권한

GitHub OAuth로 로그인한다. 사용자의 `auth.uid()`가 `members.user_id`에 연결된 활성 멤버일 때만 해당 스터디 데이터를 읽고 PR 댓글을 쓸 수 있다. PR 파일은 서버 Route Handler가 GitHub에서 읽고 OAuth provider token을 클라이언트로 내보내지 않는다. Edge Functions만 service role을 사용해 webhook 수집과 알림 기록을 수행한다.

## 데모와 운영 모드

- 데모: Supabase 환경 변수가 없거나 `NEXT_PUBLIC_DEMO_MODE=true`. 현재 날짜를 기준으로 샘플 대시보드를 렌더링한다.
- 운영: `NEXT_PUBLIC_DEMO_MODE=false`와 Supabase 환경 변수를 설정한다. 미인증 사용자는 `/login`으로 이동한다.

## 디자인 시스템

제공된 `Alsseu Dashboard.dc.html`을 기준으로 한다.

- Accent `#00C471`, hover `#00A65E`, accent soft `#E7F9F0`
- Ink `#212529`, muted `#6B7684`, border `#E5E8EB`
- 벌금 상태에서만 `#C0392B`
- Pretendard 계열 본문, JetBrains Mono 계열 숫자
- 흰색 반투명 표면과 backdrop blur로 절제된 Glass UI 사용
- 완료 `✓`, 진행 `▲`, 주의 `!`, 벌금 `✕`, 휴면 `◦`를 텍스트와 함께 사용해 색만으로 상태를 구분하지 않는다.
- 5문제 슬롯을 로고, 요약, 멤버 행에 반복한다.

## 외부 설정 순서

1. Supabase 프로젝트 연결 후 migration 적용
2. GitHub OAuth provider와 callback URL 등록
3. 활성 멤버 seed 및 `auth.users.id` 연결
4. Edge Function secrets 등록
5. 원본 GitHub repo webhook 등록
6. Discord reminder function 배포 후 Cron SQL 실행
7. Vercel 환경 변수 등록 및 배포
