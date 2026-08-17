export type MemberStatus = "active" | "dormant";

export type PullRequest = {
  id: string;
  number: number;
  title: string;
  url: string;
  authorLogin: string;
  openedAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  headBranch: string;
};

export type StudyMember = {
  id: string;
  displayName: string;
  githubLogin: string;
  avatarUrl: string | null;
  status: MemberStatus;
};

export type MemberProgress = StudyMember & {
  solvedCount: number;
  remainingCount: number;
  completed: boolean;
  pullRequests: PullRequest[];
};

export type StudyWeek = {
  startsAt: string;
  endsAt: string;
};

export type DashboardData = {
  source: "demo" | "supabase";
  study: {
    id: string;
    name: string;
    slug: string;
    githubRepository: string;
    weeklyQuota: 5;
    kakaoPayUrl: string;
  };
  week: StudyWeek;
  members: MemberProgress[];
  activity: PullRequest[];
  syncedAt: string;
};
