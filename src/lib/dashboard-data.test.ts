import { describe, expect, it } from "vitest";
import type { PullRequest, StudyMember } from "@/domain/types";
import {
  buildDashboardWeekViews,
  getDashboardWarmupWindow,
  getDashboardWeek,
} from "./dashboard-data";

describe("dashboard week selection", () => {
  const now = new Date("2026-08-17T03:00:00.000Z");

  it("selects the current Asia/Seoul study week by default", () => {
    expect(getDashboardWeek(now, "current")).toEqual({
      startsAt: "2026-08-16T15:00:00.000Z",
      endsAt: "2026-08-23T14:59:59.999Z",
    });
  });

  it("selects the immediately preceding Asia/Seoul study week", () => {
    expect(getDashboardWeek(now, "previous")).toEqual({
      startsAt: "2026-08-09T15:00:00.000Z",
      endsAt: "2026-08-16T14:59:59.999Z",
    });
  });

  it("queries the current and immediately preceding weeks together", () => {
    expect(getDashboardWarmupWindow(now)).toEqual({
      startsAt: "2026-08-09T15:00:00.000Z",
      endsAt: "2026-08-23T14:59:59.999Z",
    });
  });

  it("builds both week views from one recent PR query", () => {
    const members: StudyMember[] = [
      {
        id: "member-1",
        displayName: "Kirby",
        githubLogin: "tomchaccom",
        avatarUrl: null,
        status: "active",
      },
    ];
    const pullRequests: PullRequest[] = [
      {
        id: "current-pr",
        number: 1061,
        title: "이번 주 문제",
        url: "https://github.com/algo-gongbu/algo-study/pull/1061",
        authorLogin: "tomchaccom",
        openedAt: "2026-08-17T01:00:00.000Z",
        mergedAt: "2026-08-17T02:00:00.000Z",
        additions: 10,
        deletions: 1,
        changedFiles: 1,
        headBranch: "solution/current",
      },
      {
        id: "previous-pr",
        number: 1060,
        title: "지난주 문제",
        url: "https://github.com/algo-gongbu/algo-study/pull/1060",
        authorLogin: "tomchaccom",
        openedAt: "2026-08-10T01:00:00.000Z",
        mergedAt: "2026-08-10T02:00:00.000Z",
        additions: 9,
        deletions: 0,
        changedFiles: 1,
        headBranch: "solution/previous",
      },
    ];

    const views = buildDashboardWeekViews(members, pullRequests, now);

    expect(views.current.activity.map((pullRequest) => pullRequest.id)).toEqual([
      "current-pr",
    ]);
    expect(views.previous.activity.map((pullRequest) => pullRequest.id)).toEqual([
      "previous-pr",
    ]);
    expect(views.current.members[0].solvedCount).toBe(1);
    expect(views.previous.members[0].solvedCount).toBe(1);
  });
});
