import { describe, expect, it } from "vitest";
import {
  buildMemberProgress,
  getDeadlineState,
  getPenaltyTargets,
  getReminderTargets,
  getStudyWeek,
  WEEKLY_QUOTA,
} from "./study";
import type { PullRequest, StudyMember } from "./types";

const week = getStudyWeek(new Date("2026-08-12T03:00:00.000Z"));
const members: StudyMember[] = [
  {
    id: "member-1",
    displayName: "활성 멤버",
    githubLogin: "active",
    avatarUrl: null,
    status: "active",
  },
  {
    id: "member-2",
    displayName: "휴면 멤버",
    githubLogin: "dormant",
    avatarUrl: null,
    status: "dormant",
  },
];

function makePullRequest(
  id: string,
  mergedAt: string | null,
  authorLogin = "active",
): PullRequest {
  return {
    id,
    number: Number(id.replace(/\D/g, "")) || 1,
    title: `문제 풀이 ${id}`,
    url: "https://github.com/example/study/pull/1",
    authorLogin,
    openedAt: "2026-08-11T00:00:00.000Z",
    mergedAt,
    additions: 10,
    deletions: 0,
    changedFiles: 1,
    headBranch: `solution/${id}`,
  };
}

describe("study week", () => {
  it("uses Monday 00:00 through Sunday 23:59:59 in Asia/Seoul", () => {
    expect(week).toEqual({
      startsAt: "2026-08-09T15:00:00.000Z",
      endsAt: "2026-08-16T14:59:59.999Z",
    });
  });

  it("enters warning state only during the final three hours", () => {
    expect(getDeadlineState(new Date("2026-08-16T11:59:59.999Z"), week)).toBe(
      "warning",
    );
    expect(getDeadlineState(new Date("2026-08-16T15:00:00.000Z"), week)).toBe(
      "closed",
    );
  });
});

describe("weekly progress", () => {
  it("counts merged PRs only and caps the visible result at the fixed quota", () => {
    const pullRequests = [
      ...Array.from({ length: 6 }, (_, index) =>
        makePullRequest(
          `pr-${index + 1}`,
          `2026-08-${10 + index}T01:00:00.000Z`,
        ),
      ),
      makePullRequest("open-7", null),
      makePullRequest("old-8", "2026-08-08T01:00:00.000Z"),
    ];

    const [active] = buildMemberProgress(members, pullRequests, week);

    expect(active.solvedCount).toBe(WEEKLY_QUOTA);
    expect(active.pullRequests).toHaveLength(6);
    expect(active.completed).toBe(true);
  });

  it("keeps zero-solvers and excludes dormant members from penalties and reminders", () => {
    const progress = buildMemberProgress(members, [], week);

    expect(progress[0].solvedCount).toBe(0);
    expect(getPenaltyTargets(progress).map((member) => member.githubLogin)).toEqual([
      "active",
    ]);
    expect(getReminderTargets(progress).map((member) => member.githubLogin)).toEqual([
      "active",
    ]);
  });
});
