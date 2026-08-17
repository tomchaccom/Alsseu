"use client";

import {
  AlertTriangle,
  BellRing,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  GitFork,
  GitPullRequest,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  formatDeadlineCountdown,
  formatKoreanWeek,
  getDeadlineState,
  getPenaltyTargets,
  WEEKLY_QUOTA,
} from "@/domain/study";
import type {
  DashboardData,
  MemberProgress,
  PullRequest,
} from "@/domain/types";

type Tab = "week" | "activity" | "history";

const koreanDateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function initials(name: string) {
  return Array.from(name).slice(-2).join("");
}

function ProblemSlots({ member }: { member: MemberProgress }) {
  return (
    <div
      className={`problem-slots ${member.status === "dormant" ? "problem-slots--dormant" : ""}`}
      aria-label={`${member.displayName} ${member.solvedCount}/${WEEKLY_QUOTA}문제`}
    >
      {Array.from({ length: WEEKLY_QUOTA }, (_, index) => {
        const completed = index < member.solvedCount;
        return (
          <span
            className={`problem-slot ${completed ? "problem-slot--done" : ""}`}
            key={index}
            aria-hidden="true"
          >
            {member.status === "dormant" ? "◦" : completed ? "✓" : index + 1}
          </span>
        );
      })}
    </div>
  );
}

function MemberStatus({ member }: { member: MemberProgress }) {
  if (member.status === "dormant") {
    return <span className="member-status member-status--dormant">◦ 휴면</span>;
  }
  if (member.completed) {
    return <span className="member-status member-status--complete">✓ 완료</span>;
  }
  if (member.remainingCount <= 1) {
    return <span className="member-status member-status--near">▲ 한 문제 남음</span>;
  }
  return (
    <span className="member-status member-status--progress">
      ▲ {member.remainingCount}문제 남음
    </span>
  );
}

function PullRequestDialog({
  pullRequest,
  onClose,
}: {
  pullRequest: PullRequest;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="pr-dialog glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="icon-button dialog-close" type="button" onClick={onClose} aria-label="닫기">
          <X size={19} aria-hidden="true" />
        </button>
        <div className="dialog-kicker">
          <GitPullRequest size={17} aria-hidden="true" /> MERGED PR #{pullRequest.number}
        </div>
        <h2 id="pr-dialog-title">{pullRequest.title}</h2>
        <p className="dialog-author">@{pullRequest.authorLogin} · {pullRequest.mergedAt ? koreanDateTime.format(new Date(pullRequest.mergedAt)) : "아직 merge 전"}</p>

        <div className="code-preview" aria-label="PR 변경 요약">
          <div className="code-preview__header">
            <span>{pullRequest.headBranch}</span>
            <span>{pullRequest.changedFiles} file changed</span>
          </div>
          <pre><code><span className="code-line code-line--add">+ solution submitted</span>{"\n"}<span className="code-line">  GitHub에서 전체 풀이와 diff를 확인하세요.</span></code></pre>
        </div>

        <div className="dialog-footer">
          <div className="diff-stat" aria-label="코드 변경량">
            <span>+{pullRequest.additions}</span>
            <span>−{pullRequest.deletions}</span>
          </div>
          <a className="secondary-button" href={pullRequest.url} target="_blank" rel="noreferrer">
            GitHub에서 보기 <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}

export function DashboardShell({
  data,
  initialNow,
}: {
  data: DashboardData;
  initialNow: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("week");
  const [selectedPullRequest, setSelectedPullRequest] = useState<PullRequest | null>(null);
  const [now, setNow] = useState(() => new Date(initialNow));

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow((current) => new Date(current.getTime() + 60_000)),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const activeMembers = data.members.filter((member) => member.status === "active");
  const completedMembers = activeMembers.filter((member) => member.completed);
  const penaltyTargets = getPenaltyTargets(data.members);
  const totalSolved = activeMembers.reduce((sum, member) => sum + member.solvedCount, 0);
  const possibleProblems = activeMembers.length * WEEKLY_QUOTA;
  const averagePercent = possibleProblems
    ? Math.round((totalSolved / possibleProblems) * 100)
    : 0;
  const deadlineState = getDeadlineState(now, data.week);
  const allComplete = activeMembers.length > 0 && completedMembers.length === activeMembers.length;
  const latestActivity = useMemo(() => data.activity.slice(0, 20), [data.activity]);
  const ringStyle = { "--progress": `${averagePercent}%` } as CSSProperties;

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <header className="topbar glass-surface">
        <a className="brand-lockup" href="#top" aria-label="알쓰 홈">
          <span className="brand-slots" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          <span>알쓰</span>
        </a>

        <nav className="main-nav" aria-label="대시보드 메뉴">
          {([
            ["week", "이번 주"],
            ["activity", "PR 활동"],
            ["history", "지난 주차"],
          ] as const).map(([tab, label]) => (
            <button
              className={activeTab === tab ? "is-active" : ""}
              type="button"
              key={tab}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          {data.source === "demo" && <span className="demo-badge">DEMO</span>}
          <a
            className="repo-link"
            href={`https://github.com/${data.study.githubRepository}`}
            target="_blank"
            rel="noreferrer"
          >
            <GitFork size={17} aria-hidden="true" />
            <span>{data.study.githubRepository}</span>
          </a>
          <span className="avatar avatar--small" aria-hidden="true">알</span>
        </div>
      </header>

      <main className="dashboard" id="top">
        <section className="dashboard-heading">
          <div>
            <p className="eyebrow">WEEKLY DASHBOARD</p>
            <h1>{data.study.name}</h1>
            <p className="week-label">{formatKoreanWeek(data.week)} · 주간 5문제</p>
          </div>
          <div className="sync-status" title={new Date(data.syncedAt).toISOString()}>
            <RefreshCw size={14} aria-hidden="true" />
            {koreanDateTime.format(new Date(data.syncedAt))} 동기화
          </div>
        </section>

        {deadlineState === "warning" && !allComplete && (
          <section className="deadline-alert deadline-alert--warning" aria-label="마감 임박">
            <span className="status-mark status-mark--warning">!</span>
            <div>
              <strong>마감까지 {formatDeadlineCountdown(now, data.week)}</strong>
              <p>아직 {penaltyTargets.length}명이 이번 주 5문제를 채우지 못했어요.</p>
            </div>
            <BellRing size={20} aria-hidden="true" />
          </section>
        )}

        {allComplete && (
          <section className="deadline-alert deadline-alert--success" aria-label="전원 완료">
            <span className="status-mark status-mark--success">✓</span>
            <div>
              <strong>이번 주 전원 완주!</strong>
              <p>활성 멤버 모두 주간 5문제를 완료했어요.</p>
            </div>
            <Check size={20} aria-hidden="true" />
          </section>
        )}

        {deadlineState === "closed" && (
          <section className="deadline-alert deadline-alert--closed" aria-label="주간 마감">
            <span className="status-mark status-mark--closed">✕</span>
            <div>
              <strong>이번 주 집계가 마감되었어요</strong>
              <p>마감 시점의 merge PR을 기준으로 결과를 고정했습니다.</p>
            </div>
            <Clock3 size={20} aria-hidden="true" />
          </section>
        )}

        {activeTab === "week" && (
          <>
            <section className="summary-grid" aria-label="주간 요약">
              <article className="summary-card glass-card summary-card--progress">
                <div className="progress-ring" style={ringStyle}>
                  <span>{averagePercent}<small>%</small></span>
                </div>
                <div>
                  <p>전체 달성률</p>
                  <strong>{totalSolved}<span> / {possibleProblems}문제</span></strong>
                  <small>활성 멤버 기준</small>
                </div>
              </article>

              <article className="summary-card glass-card">
                <span className="summary-icon"><Users size={20} aria-hidden="true" /></span>
                <div>
                  <p>완주 멤버</p>
                  <strong>{completedMembers.length}<span> / {activeMembers.length}명</span></strong>
                  <small>{allComplete ? "모두 완료했어요" : "끝까지 함께 가요"}</small>
                </div>
                <div className="mini-slots" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => <i className={index < Math.min(completedMembers.length, 5) ? "is-filled" : ""} key={index} />)}
                </div>
              </article>

              <article className="summary-card glass-card">
                <span className="summary-icon"><Clock3 size={20} aria-hidden="true" /></span>
                <div>
                  <p>{deadlineState === "closed" ? "집계 상태" : "남은 시간"}</p>
                  <strong className="mono-value">{formatDeadlineCountdown(now, data.week)}</strong>
                  <small>일요일 23:59 KST 마감</small>
                </div>
              </article>

              <article className={`summary-card glass-card ${deadlineState === "closed" && penaltyTargets.length ? "summary-card--danger" : ""}`}>
                <span className="summary-icon"><CircleDollarSign size={20} aria-hidden="true" /></span>
                <div>
                  <p>벌금 대상</p>
                  <strong>{deadlineState === "closed" ? penaltyTargets.length : "–"}<span>{deadlineState === "closed" ? "명" : " 마감 후 확정"}</span></strong>
                  <small>납부 여부는 추적하지 않아요</small>
                </div>
              </article>
            </section>

            <section className="member-section glass-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">TEAM PROGRESS</p>
                  <h2>팀원별 진행 상황</h2>
                </div>
                <span>merge PR 1개 = 문제 1개</span>
              </div>

              <div className="member-list">
                {data.members.map((member) => (
                  <article className={`member-row ${member.status === "dormant" ? "member-row--dormant" : ""}`} key={member.id}>
                    <div className="member-identity">
                      <span className="avatar" aria-hidden="true">{initials(member.displayName)}</span>
                      <div>
                        <strong>{member.displayName}</strong>
                        <span>@{member.githubLogin}</span>
                      </div>
                    </div>
                    <ProblemSlots member={member} />
                    <div className="member-count">
                      <strong>{member.solvedCount}</strong><span>/5</span>
                    </div>
                    <MemberStatus member={member} />
                    <div className="member-prs">
                      {member.pullRequests[0] ? (
                        <button type="button" onClick={() => setSelectedPullRequest(member.pullRequests[0])}>
                          PR #{member.pullRequests[0].number} <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      ) : (
                        <span>아직 merge된 PR 없음</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {deadlineState === "closed" && (
              <section className={`penalty-panel glass-card ${penaltyTargets.length === 0 ? "penalty-panel--clear" : ""}`}>
                <div className="penalty-heading">
                  <span className={`status-mark ${penaltyTargets.length ? "status-mark--closed" : "status-mark--success"}`}>
                    {penaltyTargets.length ? "✕" : "✓"}
                  </span>
                  <div>
                    <p className="eyebrow">WEEKLY RESULT</p>
                    <h2>{penaltyTargets.length ? "벌금 제출 대상" : "이번 주 벌금 대상이 없어요"}</h2>
                    <p>{penaltyTargets.length ? "5문제 미만인 활성 멤버만 표시합니다." : "활성 멤버 모두 할당량을 완료했습니다."}</p>
                  </div>
                </div>

                {penaltyTargets.length > 0 && (
                  <div className="penalty-members">
                    {penaltyTargets.map((member) => (
                      <span key={member.id}><b>{initials(member.displayName)}</b>{member.displayName}<small>{member.solvedCount}/5</small></span>
                    ))}
                  </div>
                )}

                <a className="penalty-link" href={data.study.kakaoPayUrl} target="_blank" rel="noreferrer">
                  카카오 모임통장으로 이동 <ExternalLink size={16} aria-hidden="true" />
                </a>
              </section>
            )}
          </>
        )}

        {activeTab === "activity" && (
          <section className="activity-section glass-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PULL REQUESTS</p>
                <h2>이번 주 PR 활동</h2>
              </div>
              <span>{latestActivity.length}개 기록</span>
            </div>
            <div className="activity-list">
              {latestActivity.length ? latestActivity.map((pullRequest) => (
                <button className="activity-row" type="button" key={pullRequest.id} onClick={() => setSelectedPullRequest(pullRequest)}>
                  <span className={`pr-state ${pullRequest.mergedAt ? "pr-state--merged" : ""}`}>
                    <GitPullRequest size={17} aria-hidden="true" />
                  </span>
                  <span className="activity-copy">
                    <strong>{pullRequest.title}</strong>
                    <small>#{pullRequest.number} · @{pullRequest.authorLogin} · {koreanDateTime.format(new Date(pullRequest.mergedAt ?? pullRequest.openedAt))}</small>
                  </span>
                  <span className="activity-diff">+{pullRequest.additions} −{pullRequest.deletions}</span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              )) : (
                <div className="empty-state">
                  <GitPullRequest size={28} aria-hidden="true" />
                  <strong>이번 주 PR이 아직 없어요</strong>
                  <p>원본 레포에 PR이 merge되면 여기에 표시됩니다.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "history" && (
          <section className="history-section glass-card">
            <span className="summary-icon"><AlertTriangle size={21} aria-hidden="true" /></span>
            <p className="eyebrow">NEXT ITERATION</p>
            <h2>지난 주차 보기는 다음 단계에서 열려요</h2>
            <p>MVP는 현재 주차의 PR, 마감 알림, 벌금 대상 확인에 집중합니다.</p>
          </section>
        )}
      </main>

      <footer className="footer">
        <span>알쓰 · 매주 5문제의 리듬</span>
        <span>기준 시간대 Asia/Seoul</span>
      </footer>

      {selectedPullRequest && (
        <PullRequestDialog pullRequest={selectedPullRequest} onClose={() => setSelectedPullRequest(null)} />
      )}
    </div>
  );
}
