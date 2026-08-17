import type {
  MemberProgress,
  PullRequest,
  StudyMember,
  StudyWeek,
} from "./types";

export const WEEKLY_QUOTA = 5 as const;
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getStudyWeek(now: Date): StudyWeek {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const daysSinceMonday = (kst.getUTCDay() + 6) % 7;
  const startUtc =
    Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth(),
      kst.getUTCDate() - daysSinceMonday,
    ) - KST_OFFSET_MS;

  return {
    startsAt: new Date(startUtc).toISOString(),
    endsAt: new Date(startUtc + WEEK_MS - 1).toISOString(),
  };
}

export function isMergedInWeek(pr: PullRequest, week: StudyWeek): boolean {
  if (!pr.mergedAt) return false;

  const mergedAt = new Date(pr.mergedAt).getTime();
  return (
    mergedAt >= new Date(week.startsAt).getTime() &&
    mergedAt <= new Date(week.endsAt).getTime()
  );
}

export function buildMemberProgress(
  members: StudyMember[],
  pullRequests: PullRequest[],
  week: StudyWeek,
): MemberProgress[] {
  return members.map((member) => {
    const memberPullRequests = pullRequests
      .filter(
        (pullRequest) =>
          pullRequest.authorLogin.toLowerCase() ===
            member.githubLogin.toLowerCase() && isMergedInWeek(pullRequest, week),
      )
      .sort((a, b) =>
        (b.mergedAt ?? "").localeCompare(a.mergedAt ?? ""),
      );
    const solvedCount = Math.min(memberPullRequests.length, WEEKLY_QUOTA);

    return {
      ...member,
      solvedCount,
      remainingCount:
        member.status === "active" ? WEEKLY_QUOTA - solvedCount : 0,
      completed: member.status === "active" && solvedCount >= WEEKLY_QUOTA,
      pullRequests: memberPullRequests,
    };
  });
}

export function getPenaltyTargets(progress: MemberProgress[]): MemberProgress[] {
  return progress.filter(
    (member) => member.status === "active" && member.solvedCount < WEEKLY_QUOTA,
  );
}

export function getReminderTargets(progress: MemberProgress[]): MemberProgress[] {
  return getPenaltyTargets(progress);
}

export function getDeadlineState(
  now: Date,
  week: StudyWeek,
): "open" | "warning" | "closed" {
  const remaining = new Date(week.endsAt).getTime() - now.getTime();

  if (remaining < 0) return "closed";
  if (remaining <= THREE_HOURS_MS) return "warning";
  return "open";
}

export function formatKoreanWeek(week: StudyWeek): string {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });

  return `${formatter.format(new Date(week.startsAt))} – ${formatter.format(
    new Date(week.endsAt),
  )}`;
}

export function formatDeadlineCountdown(now: Date, week: StudyWeek): string {
  const remaining = Math.max(
    0,
    new Date(week.endsAt).getTime() - now.getTime(),
  );
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if (remaining === 0) return "마감됨";
  if (hours >= 24) return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
  return `${hours}시간 ${minutes}분`;
}
