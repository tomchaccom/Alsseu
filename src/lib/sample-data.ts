import {
  buildMemberProgress,
  getStudyWeek,
  KST_OFFSET_MS,
} from "@/domain/study";
import type {
  DashboardData,
  PullRequest,
  StudyMember,
} from "@/domain/types";

type DemoState = "default" | "warning" | "closed" | "complete";

function dateInsideWeek(startsAt: string, day: number, hour: number): string {
  return new Date(
    new Date(startsAt).getTime() +
      day * 24 * 60 * 60 * 1000 +
      hour * 60 * 60 * 1000,
  ).toISOString();
}

function buildPullRequest(
  number: number,
  authorLogin: string,
  title: string,
  weekStart: string,
  day: number,
): PullRequest {
  return {
    id: `demo-pr-${number}`,
    number,
    title,
    url: `https://github.com/algo-gongbu/algo-study/pull/${number}`,
    authorLogin,
    openedAt: dateInsideWeek(weekStart, day, 2),
    mergedAt: dateInsideWeek(weekStart, day, 5),
    additions: 18 + (number % 17),
    deletions: number % 6,
    changedFiles: 1,
    headBranch: `solution/${authorLogin}-${number}`,
  };
}

export function getSampleDashboard(
  now = new Date(),
  state: DemoState = "default",
): DashboardData {
  let displayNow = now;
  const initialWeek = getStudyWeek(now);

  if (state === "warning") {
    displayNow = new Date(new Date(initialWeek.endsAt).getTime() - 2 * 60 * 60 * 1000);
  }

  if (state === "closed") {
    displayNow = new Date(new Date(initialWeek.endsAt).getTime() + 60 * 1000);
  }

  const week = getStudyWeek(
    state === "closed"
      ? new Date(displayNow.getTime() - KST_OFFSET_MS)
      : displayNow,
  );
  const members: StudyMember[] = [
    {
      id: "member-1",
      displayName: "김알고",
      githubLogin: "algokim",
      avatarUrl: null,
      status: "active",
    },
    {
      id: "member-2",
      displayName: "박코딩",
      githubLogin: "codepark",
      avatarUrl: null,
      status: "active",
    },
    {
      id: "member-3",
      displayName: "이문제",
      githubLogin: "problemlee",
      avatarUrl: null,
      status: "active",
    },
    {
      id: "member-4",
      displayName: "최휴면",
      githubLogin: "restchoi",
      avatarUrl: null,
      status: "dormant",
    },
  ];

  const counts = state === "complete" ? [5, 5, 5] : [5, 3, 1];
  const titles = [
    "[백준 17298] 오큰수 풀이",
    "[프로그래머스] 가장 먼 노드",
    "[백준 11053] 가장 긴 증가하는 부분 수열",
    "[백준 7576] 토마토",
    "[프로그래머스] 네트워크",
  ];
  const pullRequests = counts.flatMap((count, memberIndex) =>
    Array.from({ length: count }, (_, index) =>
      buildPullRequest(
        142 - memberIndex * 10 - index,
        members[memberIndex].githubLogin,
        titles[index % titles.length],
        week.startsAt,
        Math.min(index + memberIndex, 5),
      ),
    ),
  );
  const progress = buildMemberProgress(members, pullRequests, week);

  return {
    source: "demo",
    study: {
      id: "demo-study",
      name: "알쓰 알고리즘 스터디",
      slug: "algo-study",
      githubRepository: "algo-gongbu/algo-study",
      weeklyQuota: 5,
      kakaoPayUrl: "https://link.kakaopay.com/",
    },
    week,
    members: progress,
    activity: [...pullRequests].sort((a, b) =>
      (b.mergedAt ?? b.openedAt).localeCompare(a.mergedAt ?? a.openedAt),
    ),
    syncedAt: displayNow.toISOString(),
  };
}
