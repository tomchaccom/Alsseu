"use client";

import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import {
  BellRing,
  Check,
  ChevronRight,
  CircleDollarSign,
  Code2,
  Clock3,
  ExternalLink,
  FileText,
  GitFork,
  GitPullRequest,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  Users,
  X,
} from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
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
  DashboardWeekSelection,
  MemberProgress,
  PullRequest,
  PullRequestComment,
  PullRequestDetails,
} from "@/domain/types";

type Tab = "week" | "activity";

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

function difficultyScore(headBranch: string): number {
  // BOJ: boj/{tier}/...
  const boj = headBranch.match(/^boj\/(ruby|diamond|platinum|gold|silver|bronze)/i);
  if (boj) {
    const scores: Record<string, number> = { bronze: 10, silver: 20, gold: 30, platinum: 40, diamond: 50, ruby: 60 };
    return scores[boj[1].toLowerCase()] ?? 0;
  }
  // Programmers: pro/level{n} | Pro/lv.{n} | pro/lv{n} 등 대소문자·약어 혼용
  const pro = headBranch.match(/^[Pp]ro\/(?:level|lv\.?)(\d)/i);
  if (pro) return parseInt(pro[1]) * 10;
  // LeetCode: leet/{easy|medium|hard}/...
  const leet = headBranch.match(/^leet\/(easy|medium|hard)/i);
  if (leet) {
    const scores: Record<string, number> = { easy: 20, medium: 35, hard: 50 };
    return scores[leet[1].toLowerCase()] ?? 0;
  }
  return 0;
}

function getHardestSolvers(members: MemberProgress[]): Set<string> {
  let maxScore = 0;
  for (const member of members) {
    if (member.status !== "active") continue;
    for (const pr of member.pullRequests) {
      const score = difficultyScore(pr.headBranch ?? "");
      if (score > maxScore) maxScore = score;
    }
  }
  if (maxScore === 0) return new Set();
  const result = new Set<string>();
  for (const member of members) {
    if (member.status !== "active") continue;
    if (member.pullRequests.some((pr) => difficultyScore(pr.headBranch ?? "") === maxScore)) {
      result.add(member.id);
    }
  }
  return result;
}

function MemberAvatar({ member }: { member: MemberProgress }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!member.avatarUrl || imageFailed) {
    return <span className="avatar" aria-hidden="true">{initials(member.displayName)}</span>;
  }

  return (
    <Image
      className="avatar avatar--profile"
      src={member.avatarUrl}
      alt={`${member.displayName} GitHub 프로필`}
      width={42}
      height={42}
      onError={() => setImageFailed(true)}
    />
  );
}

function ProblemSlots({
  member,
  onSelect,
}: {
  member: MemberProgress;
  onSelect: (pullRequest: PullRequest) => void;
}) {
  return (
    <div
      className={`problem-slots ${member.status === "dormant" ? "problem-slots--dormant" : ""}`}
      aria-label={`${member.displayName} ${member.solvedCount}/${WEEKLY_QUOTA}문제`}
    >
      {Array.from({ length: WEEKLY_QUOTA }, (_, index) => {
        const prIndex = member.solvedCount - 1 - index;
        const pullRequest = prIndex >= 0 ? member.pullRequests[prIndex] : undefined;
        const completed = Boolean(pullRequest) && index < member.solvedCount;

        if (completed && pullRequest && member.status === "active") {
          return (
            <button
              className="problem-slot problem-slot--done"
              key={pullRequest.id}
              type="button"
              onClick={() => onSelect(pullRequest)}
              aria-label={`${member.displayName} ${index + 1}번 문제 PR #${pullRequest.number} 열기`}
              title={`PR #${pullRequest.number} · ${pullRequest.title}`}
            >
              {index + 1}
            </button>
          );
        }

        return (
          <span
            className="problem-slot"
            key={index}
            aria-hidden="true"
          >
            {member.status === "dormant" ? "◦" : index + 1}
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

type LineSelection = {
  filePath: string;
  lineNumber: number;
};

function CommentItem({
  comment,
  inline = false,
}: {
  comment: PullRequestComment;
  inline?: boolean;
}) {
  return (
    <article className={`comment-item ${inline ? "comment-item--inline" : ""}`}>
      <span className="comment-avatar" aria-hidden="true">
        {initials(comment.author.displayName)}
      </span>
      <div>
        <div className="comment-meta">
          <strong>{comment.author.displayName}</strong>
          <span>@{comment.author.githubLogin}</span>
          <time dateTime={comment.createdAt}>
            {koreanDateTime.format(new Date(comment.createdAt))}
          </time>
        </div>
        <p>{comment.body}</p>
      </div>
    </article>
  );
}

function PullRequestDialog({
  pullRequest,
  initialDetails,
  onClose,
}: {
  pullRequest: PullRequest;
  initialDetails?: PullRequestDetails;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<PullRequestDetails | null>(
    initialDetails ?? null,
  );
  const [detailError, setDetailError] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [lineCommentBody, setLineCommentBody] = useState("");
  const [selectedLine, setSelectedLine] = useState<LineSelection | null>(null);
  const [commentError, setCommentError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDetails() {
      setDetails(initialDetails ?? null);
      setDetailError("");
      setCommentBody("");
      setLineCommentBody("");
      setSelectedLine(null);
      setCommentError("");

      try {
        const response = await fetch(`/api/pull-requests/${pullRequest.id}`, {
          signal: controller.signal,
        });
        const value = (await response.json()) as PullRequestDetails & {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(value.message ?? "PR 상세 정보를 불러오지 못했어요.");
        }

        setDetails(value);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!initialDetails) {
          setDetailError(
            error instanceof Error
              ? error.message
              : "PR 상세 정보를 불러오지 못했어요.",
          );
        }
      }
    }

    void loadDetails();
    return () => controller.abort();
  }, [initialDetails, pullRequest.id]);

  async function submitComment(
    event: React.FormEvent<HTMLFormElement>,
    location: LineSelection | null = null,
  ) {
    event.preventDefault();
    const body = (location ? lineCommentBody : commentBody).trim();
    if (!body || body.length > 2000 || isSubmitting) return;

    setIsSubmitting(true);
    setCommentError("");

    try {
      const response = await fetch(`/api/pull-requests/${pullRequest.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          filePath: location?.filePath ?? null,
          lineNumber: location?.lineNumber ?? null,
        }),
      });
      const value = (await response.json()) as {
        comment?: PullRequestComment;
        message?: string;
      };

      if (!response.ok || !value.comment) {
        throw new Error(value.message ?? "댓글을 저장하지 못했어요.");
      }

      const savedComment: PullRequestComment = {
        ...value.comment,
        filePath: value.comment.filePath ?? location?.filePath ?? null,
        lineNumber: value.comment.lineNumber ?? location?.lineNumber ?? null,
      };
      setDetails((current) => current
        ? { ...current, comments: [...current.comments, savedComment] }
        : current);

      if (location) {
        setLineCommentBody("");
        setSelectedLine(null);
      } else {
        setCommentBody("");
      }
    } catch (error) {
      setCommentError(
        error instanceof Error ? error.message : "댓글을 저장하지 못했어요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const comments = details?.comments ?? [];
  const generalComments = comments.filter(
    (comment) => !comment.filePath || !comment.lineNumber,
  );

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

        <div className="dialog-content">
          {!details && !detailError && (
            <div className="pr-detail-loading" role="status">
              <LoaderCircle size={22} aria-hidden="true" />
              GitHub에서 문제와 코드를 불러오는 중이에요.
            </div>
          )}

          {detailError && (
            <div className="pr-detail-error" role="alert">
              <strong>상세 내용을 열지 못했어요.</strong>
              <span>{detailError}</span>
            </div>
          )}

          {details && (
            <>
              <div className="pr-review-grid">
                <section className="pr-detail-section pr-review-pane pr-review-pane--problem" aria-labelledby="problem-description-title">
                  <div className="pr-detail-heading">
                    <FileText size={17} aria-hidden="true" />
                    <div>
                      <h3 id="problem-description-title">문제 설명</h3>
                      <span>{details.problem?.filename ?? "README.md 없음"}</span>
                    </div>
                  </div>
                  {details.problem ? (
                    <div className="markdown-body">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                        components={{
                          a: ({ href, ...props }) => (
                            <a
                              {...props}
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                            />
                          ),
                        }}
                      >
                        {details.problem.markdown}
                      </ReactMarkdown>
                      {details.problem.truncated && (
                        <p className="content-truncated">긴 문서라 일부만 표시했어요.</p>
                      )}
                    </div>
                  ) : (
                    <p className="pr-detail-empty">PR에서 문제 설명 Markdown을 찾지 못했어요.</p>
                  )}
                </section>

                <section className="pr-detail-section pr-review-pane pr-review-pane--code" aria-labelledby="solution-code-title">
                  <div className="pr-detail-heading">
                    <Code2 size={17} aria-hidden="true" />
                    <div>
                      <h3 id="solution-code-title">풀이 코드</h3>
                      <span>{details.codeFiles.length}개 파일 · 줄을 선택해 코멘트</span>
                    </div>
                  </div>
                  {details.codeFiles.length ? (
                    <div className="solution-files">
                      {details.codeFiles.map((file) => (
                        <article className="code-preview" key={file.filename}>
                          <div className="code-preview__header">
                            <span>{file.filename}</span>
                            <span>{file.language.toUpperCase()}</span>
                          </div>
                          <div className="code-lines" role="list" aria-label={`${file.filename} 코드`}>
                            {file.content.split(/\r\n|\r|\n/).map((line, index) => {
                              const lineNumber = index + 1;
                              const isSelected = selectedLine?.filePath === file.filename
                                && selectedLine.lineNumber === lineNumber;
                              const lineComments = comments.filter(
                                (comment) => comment.filePath === file.filename
                                  && comment.lineNumber === lineNumber,
                              );

                              return (
                                <div
                                  className="code-line-group"
                                  role="listitem"
                                  aria-label={`${file.filename} ${lineNumber}번 줄 리뷰`}
                                  key={`${file.filename}-${lineNumber}`}
                                >
                                  <button
                                    className={`code-line ${isSelected ? "code-line--selected" : ""}`}
                                    type="button"
                                    aria-label={`${file.filename} ${lineNumber}번 줄에 댓글 작성`}
                                    aria-pressed={isSelected}
                                    onClick={() => {
                                      setSelectedLine(isSelected ? null : {
                                        filePath: file.filename,
                                        lineNumber,
                                      });
                                      setLineCommentBody("");
                                      setCommentError("");
                                    }}
                                  >
                                    <span className="code-line__number" aria-hidden="true">{lineNumber}</span>
                                    <code>{line || " "}</code>
                                  </button>

                                  {lineComments.map((comment) => (
                                    <CommentItem comment={comment} inline key={comment.id} />
                                  ))}

                                  {isSelected && (
                                    <form
                                      className="comment-form inline-comment-form"
                                      onSubmit={(event) => submitComment(event, selectedLine)}
                                    >
                                      <label htmlFor={`line-comment-${file.filename}-${lineNumber}`}>
                                        {lineNumber}번 줄 댓글
                                      </label>
                                      <textarea
                                        id={`line-comment-${file.filename}-${lineNumber}`}
                                        value={lineCommentBody}
                                        onChange={(event) => setLineCommentBody(event.target.value)}
                                        maxLength={2000}
                                        placeholder="이 줄에 대한 질문이나 개선점을 남겨보세요."
                                        rows={2}
                                        autoFocus
                                      />
                                      <div className="comment-form__footer">
                                        <span className={commentError ? "form-error" : ""}>
                                          {commentError || `${lineCommentBody.length}/2,000`}
                                        </span>
                                        <div className="inline-comment-actions">
                                          <button
                                            className="secondary-button"
                                            type="button"
                                            onClick={() => {
                                              setSelectedLine(null);
                                              setLineCommentBody("");
                                              setCommentError("");
                                            }}
                                          >
                                            취소
                                          </button>
                                          <button
                                            className="primary-button"
                                            type="submit"
                                            disabled={!lineCommentBody.trim() || isSubmitting}
                                          >
                                            {isSubmitting ? "저장 중" : "줄 댓글 남기기"}
                                            <Send size={14} aria-hidden="true" />
                                          </button>
                                        </div>
                                      </div>
                                    </form>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {file.truncated && (
                            <p className="content-truncated">긴 코드라 일부만 표시했어요.</p>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="pr-detail-empty">PR에서 표시할 풀이 코드를 찾지 못했어요.</p>
                  )}
                </section>
              </div>

              <section className="pr-detail-section comment-section" aria-labelledby="comments-title">
                <div className="pr-detail-heading">
                  <MessageCircle size={17} aria-hidden="true" />
                  <div>
                    <h3 id="comments-title">전체 댓글</h3>
                    <span>코드 위치 없는 Alsseu 내부 댓글 {generalComments.length}개</span>
                  </div>
                </div>

                <div className="comment-list" aria-live="polite">
                  {generalComments.length ? (
                    generalComments.map((comment) => (
                      <CommentItem comment={comment} key={comment.id} />
                    ))
                  ) : (
                    <p className="pr-detail-empty">첫 댓글을 남겨 풀이에 대한 이야기를 시작해보세요.</p>
                  )}
                </div>

                <form className="comment-form" onSubmit={(event) => submitComment(event)}>
                  <label htmlFor={`comment-${pullRequest.id}`}>댓글 작성</label>
                  <textarea
                    id={`comment-${pullRequest.id}`}
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    maxLength={2000}
                    placeholder="풀이 아이디어나 개선할 점을 남겨보세요."
                    rows={3}
                  />
                  <div className="comment-form__footer">
                    <span className={commentError ? "form-error" : ""}>
                      {commentError || `${commentBody.length}/2,000`}
                    </span>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={!commentBody.trim() || isSubmitting}
                    >
                      {isSubmitting ? "저장 중" : "댓글 남기기"}
                      <Send size={14} aria-hidden="true" />
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
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
  data: initialData,
  initialNow,
  weekSelection: initialWeekSelection = "current",
  currentUserGithubLogin = null,
}: {
  data: DashboardData;
  initialNow: string;
  weekSelection?: DashboardWeekSelection;
  currentUserGithubLogin?: string | null;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("week");
  const [weekSelection, setWeekSelection] =
    useState<DashboardWeekSelection>(initialWeekSelection);
  const [selectedPullRequest, setSelectedPullRequest] = useState<PullRequest | null>(null);
  const [now, setNow] = useState(() => new Date(initialNow));
  const selectedWeekView = initialData.weekViews?.[weekSelection];
  const data = selectedWeekView
    ? { ...initialData, ...selectedWeekView }
    : initialData;

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow((current) => new Date(current.getTime() + 60_000)),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (initialData.source !== "supabase") return;

    const startWarmup = () => {
      void fetch("/api/pull-requests/warmup", {
        method: "POST",
      }).catch(() => undefined);
    };
    const timeoutId = window.setTimeout(startWarmup, 1_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [initialData.source]);

  useEffect(() => {
    if (!initialData.weekViews) return;

    const syncWeekFromUrl = () => {
      const selection =
        new URLSearchParams(window.location.search).get("week") === "previous"
          ? "previous"
          : "current";
      setWeekSelection(selection);
      setActiveTab("week");
      setSelectedPullRequest(null);
    };

    window.addEventListener("popstate", syncWeekFromUrl);
    return () => window.removeEventListener("popstate", syncWeekFromUrl);
  }, [initialData.weekViews]);

  function selectWeek(
    event: MouseEvent<HTMLAnchorElement>,
    selection: DashboardWeekSelection,
  ) {
    if (!initialData.weekViews) return;

    event.preventDefault();
    setWeekSelection(selection);
    setActiveTab("week");
    setSelectedPullRequest(null);
    window.history.pushState(
      null,
      "",
      selection === "previous" ? "/?week=previous" : "/",
    );
  }

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
          <Link
            className={
              activeTab === "week" && weekSelection === "current"
                ? "is-active"
                : ""
            }
            href="/"
            onClick={(event) => selectWeek(event, "current")}
            prefetch={false}
          >
            이번 주
          </Link>
          <button
            className={activeTab === "activity" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveTab("activity")}
          >
            PR 활동
          </button>
          <Link
            className={
              activeTab === "week" && weekSelection === "previous"
                ? "is-active"
                : ""
            }
            href="/?week=previous"
            onClick={(event) => selectWeek(event, "previous")}
            prefetch={false}
          >
            지난 주차
          </Link>
          <Link href="/admin">멤버 관리</Link>
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
                {(() => {
                  const hardestSolvers = getHardestSolvers(data.members);
                  return [...data.members].sort((a, b) => {
                  const aDormant = a.status === "dormant";
                  const bDormant = b.status === "dormant";
                  if (aDormant !== bDormant) return aDormant ? 1 : -1;
                  const aIsMe = a.githubLogin.toLowerCase() === currentUserGithubLogin?.toLowerCase();
                  const bIsMe = b.githubLogin.toLowerCase() === currentUserGithubLogin?.toLowerCase();
                  if (aIsMe !== bIsMe) return aIsMe ? -1 : 1;
                  return b.solvedCount - a.solvedCount;
                }).map((member) => (
                  <article className={`member-row ${member.status === "dormant" ? "member-row--dormant" : ""}`} key={member.id}>
                    <div className="member-identity">
                      <MemberAvatar member={member} />
                      <div>
                        <strong>{member.displayName}</strong>
                        <span>@{member.githubLogin}</span>
                        {hardestSolvers.has(member.id) && (
                          <span className="hardest-badge">🔥 최고 난이도</span>
                        )}
                      </div>
                    </div>
                    <ProblemSlots member={member} onSelect={setSelectedPullRequest} />
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
                ));
                })()}
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
                <h2>{weekSelection === "previous" ? "지난주" : "이번 주"} PR 활동</h2>
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

      </main>

      <footer className="footer">
        <span>알쓰 · 매주 5문제의 리듬</span>
        <span>기준 시간대 Asia/Seoul</span>
      </footer>

      {selectedPullRequest && (
        <PullRequestDialog
          pullRequest={selectedPullRequest}
          onClose={() => setSelectedPullRequest(null)}
        />
      )}
    </div>
  );
}
