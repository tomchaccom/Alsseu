import { redirect } from "next/navigation";
import {
  buildMemberProgress,
  getStudyWeek,
  isMergedInWeek,
} from "@/domain/study";
import type {
  DashboardData,
  DashboardWeekSelection,
  DashboardWeekView,
  MemberStatus,
  PullRequest,
  StudyMember,
} from "@/domain/types";
import { getStudySlug } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type StudyRow = {
  id: string;
  name: string;
  slug: string;
  github_owner: string;
  github_repo: string;
  weekly_quota: number;
  kakao_pay_url: string;
};

type MemberRow = {
  id: string;
  display_name: string;
  github_login: string;
  avatar_url: string | null;
  status: MemberStatus;
};

type PullRequestRow = {
  id: string;
  github_pr_number: number;
  github_login: string;
  title: string;
  html_url: string;
  opened_at: string;
  merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  head_branch: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getDashboardWeek(
  now: Date,
  selection: DashboardWeekSelection,
) {
  const referenceDate =
    selection === "previous" ? new Date(now.getTime() - WEEK_MS) : now;

  return getStudyWeek(referenceDate);
}

export function getDashboardWarmupWindow(now: Date) {
  return {
    startsAt: getDashboardWeek(now, "previous").startsAt,
    endsAt: getDashboardWeek(now, "current").endsAt,
  };
}

export function buildDashboardWeekViews(
  members: StudyMember[],
  recentActivity: PullRequest[],
  now: Date,
): Record<DashboardWeekSelection, DashboardWeekView> {
  return {
    current: buildDashboardWeekView(
      members,
      recentActivity,
      getDashboardWeek(now, "current"),
    ),
    previous: buildDashboardWeekView(
      members,
      recentActivity,
      getDashboardWeek(now, "previous"),
    ),
  };
}

function buildDashboardWeekView(
  members: StudyMember[],
  recentActivity: PullRequest[],
  week: ReturnType<typeof getDashboardWeek>,
): DashboardWeekView {
  const activity = recentActivity.filter((pullRequest) =>
    isMergedInWeek(pullRequest, week),
  );

  return {
    week,
    members: buildMemberProgress(members, activity, week),
    activity,
  };
}

function toMember(row: MemberRow): StudyMember {
  return {
    id: row.id,
    displayName: row.display_name,
    githubLogin: row.github_login,
    avatarUrl: row.avatar_url,
    status: row.status,
  };
}

function toPullRequest(row: PullRequestRow): PullRequest {
  return {
    id: row.id,
    number: row.github_pr_number,
    title: row.title,
    url: row.html_url,
    authorLogin: row.github_login,
    openedAt: row.opened_at,
    mergedAt: row.merged_at,
    additions: row.additions,
    deletions: row.deletions,
    changedFiles: row.changed_files,
    headBranch: row.head_branch,
  };
}

export async function getDashboardData(
  now = new Date(),
  weekSelection: DashboardWeekSelection = "current",
): Promise<DashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: studyData, error: studyError } = await supabase
    .from("studies")
    .select(
      "id,name,slug,github_owner,github_repo,weekly_quota,kakao_pay_url",
    )
    .eq("slug", getStudySlug())
    .single();

  if (studyError || !studyData) redirect("/unauthorized");

  const study = studyData as StudyRow;
  const warmupWindow = getDashboardWarmupWindow(now);
  const [{ data: memberData, error: memberError }, { data: prData, error: prError }] =
    await Promise.all([
      supabase
        .from("members")
        .select("id,display_name,github_login,avatar_url,status")
        .eq("study_id", study.id)
        .order("display_name"),
      supabase
        .from("pull_requests")
        .select(
          "id,github_pr_number,github_login,title,html_url,opened_at,merged_at,additions,deletions,changed_files,head_branch",
        )
        .eq("study_id", study.id)
        .eq("state", "merged")
        .gte("merged_at", warmupWindow.startsAt)
        .lte("merged_at", warmupWindow.endsAt)
        .order("merged_at", { ascending: false }),
    ]);

  if (memberError || prError) {
    throw new Error("주간 진행 데이터를 불러오지 못했습니다.");
  }

  const members = (memberData as MemberRow[]).map(toMember);
  const recentActivity = (prData as PullRequestRow[]).map(toPullRequest);
  const weekViews = buildDashboardWeekViews(members, recentActivity, now);
  const selectedWeek = weekViews[weekSelection];
  const [githubOwner, githubRepo] = [study.github_owner, study.github_repo];

  return {
    source: "supabase",
    study: {
      id: study.id,
      name: study.name,
      slug: study.slug,
      githubRepository: `${githubOwner}/${githubRepo}`,
      weeklyQuota: 5,
      kakaoPayUrl: study.kakao_pay_url,
    },
    ...selectedWeek,
    weekViews,
    syncedAt: now.toISOString(),
  };
}
