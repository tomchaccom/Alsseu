import { getDashboardWarmupWindow } from "@/lib/dashboard-data";
import { getStudySlug } from "@/lib/env";
import { schedulePullRequestContentWarmup } from "@/lib/pull-request-content-warmup";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

type StudyRow = {
  id: string;
  github_owner: string;
  github_repo: string;
};

type PullRequestRow = {
  github_pr_number: number;
};

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("다시 로그인해주세요.", 401);

  const { data: studyData, error: studyError } = await supabase
    .from("studies")
    .select("id,github_owner,github_repo")
    .eq("slug", getStudySlug())
    .single();

  if (studyError || !studyData) {
    return jsonError("캐시할 스터디를 찾지 못했어요.", 404);
  }

  const study = studyData as StudyRow;
  const window = getDashboardWarmupWindow(new Date());
  const { data: pullRequestData, error: pullRequestError } = await supabase
    .from("pull_requests")
    .select("github_pr_number")
    .eq("study_id", study.id)
    .eq("state", "merged")
    .gte("merged_at", window.startsAt)
    .lte("merged_at", window.endsAt);

  if (pullRequestError) {
    return jsonError("캐시할 PR 목록을 불러오지 못했어요.", 500);
  }

  const pullRequests = (pullRequestData ?? []) as PullRequestRow[];
  schedulePullRequestContentWarmup({
    owner: study.github_owner,
    repo: study.github_repo,
    pullRequestNumbers: pullRequests.map((pullRequest) =>
      pullRequest.github_pr_number
    ),
  });

  return Response.json({ scheduled: pullRequests.length }, { status: 202 });
}
