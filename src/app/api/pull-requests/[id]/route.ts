import type {
  PullRequestComment,
  PullRequestDetails,
} from "@/domain/types";
import { fetchGitHubPullRequestDetails } from "@/lib/github-pr-details";
import { createClient } from "@/lib/supabase/server";

type PullRequestRow = {
  id: string;
  study_id: string;
  github_pr_number: number;
};

type StudyRow = {
  github_owner: string;
  github_repo: string;
};

type MemberRow = {
  id: string;
  display_name: string;
  github_login: string;
  avatar_url: string | null;
};

type CommentRow = {
  id: string;
  body: string;
  file_path: string | null;
  line_number: number | null;
  created_at: string;
  members: MemberRow | MemberRow[];
};

type ParsedCommentInput = {
  body: string;
  filePath: string | null;
  lineNumber: number | null;
};

const MAX_COMMENT_LENGTH = 2000;
const MAX_FILE_PATH_LENGTH = 1000;
const MAX_LINE_NUMBER = 1_000_000;

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function memberFromRelation(relation: MemberRow | MemberRow[]) {
  return Array.isArray(relation) ? relation[0] : relation;
}

function toComment(row: CommentRow): PullRequestComment | null {
  const member = memberFromRelation(row.members);
  if (!member) return null;

  return {
    id: row.id,
    body: row.body,
    filePath: row.file_path,
    lineNumber: row.line_number,
    createdAt: row.created_at,
    author: {
      displayName: member.display_name,
      githubLogin: member.github_login,
      avatarUrl: member.avatar_url,
    },
  };
}

export function parseCommentInput(value: unknown): ParsedCommentInput | null {
  if (!value || typeof value !== "object" || !("body" in value)) return null;
  const input = value as {
    body?: unknown;
    filePath?: unknown;
    lineNumber?: unknown;
  };
  const body = input.body;
  if (typeof body !== "string") return null;

  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_COMMENT_LENGTH) return null;

  const rawFilePath = input.filePath ?? null;
  const rawLineNumber = input.lineNumber ?? null;

  if (rawFilePath === null && rawLineNumber === null) {
    return { body: trimmed, filePath: null, lineNumber: null };
  }

  if (
    typeof rawFilePath !== "string" ||
    typeof rawLineNumber !== "number"
  ) {
    return null;
  }

  const filePath = rawFilePath.trim();
  if (
    filePath.length < 1 ||
    filePath.length > MAX_FILE_PATH_LENGTH ||
    !Number.isSafeInteger(rawLineNumber) ||
    rawLineNumber < 1 ||
    rawLineNumber > MAX_LINE_NUMBER
  ) {
    return null;
  }

  return { body: trimmed, filePath, lineNumber: rawLineNumber };
}

export function parseCommentBody(value: unknown) {
  return parseCommentInput(value)?.body ?? null;
}

async function getVisiblePullRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  const { data, error } = await supabase
    .from("pull_requests")
    .select("id,study_id,github_pr_number")
    .eq("id", id)
    .single();

  return error || !data ? null : (data as PullRequestRow);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("다시 로그인해주세요.", 401);

  const { id } = await params;
  const pullRequest = await getVisiblePullRequest(supabase, id);
  if (!pullRequest) return jsonError("확인할 수 없는 PR입니다.", 404);

  const [studyResult, commentResult] = await Promise.all([
    supabase
      .from("studies")
      .select("github_owner,github_repo")
      .eq("id", pullRequest.study_id)
      .single(),
    supabase
      .from("pull_request_comments")
      .select(
        "id,body,file_path,line_number,created_at,members!pull_request_comments_member_id_fkey(id,display_name,github_login,avatar_url)",
      )
      .eq("pull_request_id", pullRequest.id)
      .order("created_at", { ascending: true }),
  ]);

  if (studyResult.error || !studyResult.data || commentResult.error) {
    return jsonError("PR 상세 정보를 불러오지 못했어요.", 500);
  }

  try {
    const study = studyResult.data as StudyRow;
    const github = await fetchGitHubPullRequestDetails({
      owner: study.github_owner,
      repo: study.github_repo,
      number: pullRequest.github_pr_number,
    });
    const comments = (commentResult.data as CommentRow[])
      .map(toComment)
      .filter((comment): comment is PullRequestComment => comment !== null);
    const response: PullRequestDetails = { ...github, comments };

    return Response.json(response);
  } catch (error) {
    console.error("Failed to load GitHub pull request details", error);
    return jsonError("GitHub에서 PR 파일을 불러오지 못했어요.", 502);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return jsonError("다시 로그인해주세요.", 401);

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return jsonError("댓글 내용을 확인해주세요.", 400);
  }

  const commentInput = parseCommentInput(requestBody);
  if (!commentInput) {
    return jsonError("댓글 내용과 코드 위치를 확인해주세요.", 400);
  }

  const { id } = await params;
  const pullRequest = await getVisiblePullRequest(supabase, id);
  if (!pullRequest) return jsonError("확인할 수 없는 PR입니다.", 404);

  const { data: memberData, error: memberError } = await supabase
    .from("members")
    .select("id,display_name,github_login,avatar_url")
    .eq("study_id", pullRequest.study_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (memberError || !memberData) {
    return jsonError("활성 스터디원만 댓글을 남길 수 있어요.", 403);
  }

  if (commentInput.filePath !== null && commentInput.lineNumber !== null) {
    const studyResult = await supabase
      .from("studies")
      .select("github_owner,github_repo")
      .eq("id", pullRequest.study_id)
      .single();

    if (studyResult.error || !studyResult.data) {
      return jsonError("코드 위치를 확인하지 못했어요.", 500);
    }

    try {
      const study = studyResult.data as StudyRow;
      const github = await fetchGitHubPullRequestDetails({
        owner: study.github_owner,
        repo: study.github_repo,
        number: pullRequest.github_pr_number,
      });
      const codeFile = github.codeFiles.find(
        (file) => file.filename === commentInput.filePath,
      );
      const lineCount = codeFile
        ? codeFile.content.split(/\r\n|\r|\n/).length
        : 0;

      if (!codeFile || commentInput.lineNumber > lineCount) {
        return jsonError("해당 PR 코드에 존재하지 않는 위치입니다.", 400);
      }
    } catch (error) {
      console.error("Failed to validate pull request comment location", error);
      return jsonError("GitHub에서 코드 위치를 확인하지 못했어요.", 502);
    }
  }

  const member = memberData as MemberRow;
  const { data: commentData, error: commentError } = await supabase
    .from("pull_request_comments")
    .insert({
      pull_request_id: pullRequest.id,
      member_id: member.id,
      user_id: user.id,
      body: commentInput.body,
      file_path: commentInput.filePath,
      line_number: commentInput.lineNumber,
    })
    .select("id,body,file_path,line_number,created_at")
    .single();

  if (commentError || !commentData) {
    return jsonError("댓글을 저장하지 못했어요.", 500);
  }

  const comment: PullRequestComment = {
    id: commentData.id as string,
    body: commentData.body as string,
    filePath: commentData.file_path as string | null,
    lineNumber: commentData.line_number as number | null,
    createdAt: commentData.created_at as string,
    author: {
      displayName: member.display_name,
      githubLogin: member.github_login,
      avatarUrl: member.avatar_url,
    },
  };

  return Response.json({ comment }, { status: 201 });
}
