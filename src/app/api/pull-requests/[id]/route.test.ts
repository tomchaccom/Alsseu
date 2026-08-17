import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubPullRequestDetails } from "@/lib/github-pr-details";
import { createClient } from "@/lib/supabase/server";
import { GET, POST, parseCommentBody, parseCommentInput } from "./route";

vi.mock("@/lib/github-pr-details", () => ({
  fetchGitHubPullRequestDetails: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const prId = "11111111-1111-4111-8111-111111111111";
const studyId = "22222222-2222-4222-8222-222222222222";

function query(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.order.mockResolvedValue(result);
  builder.single.mockResolvedValue(result);
  return builder;
}

function mockGetSupabase({ authenticated = true } = {}) {
  const pullRequestQuery = query({
    data: { id: prId, study_id: studyId, github_pr_number: 1060 },
    error: null,
  });
  const studyQuery = query({
    data: { github_owner: "algo-gongbu", github_repo: "algo-study" },
    error: null,
  });
  const commentQuery = query({
    data: [
      {
        id: "comment-1",
        body: "좋은 풀이예요!",
        file_path: null,
        line_number: null,
        created_at: "2026-08-17T01:00:00.000Z",
        members: {
          id: "member-1",
          display_name: "Kirby",
          github_login: "tomchaccom",
          avatar_url: null,
        },
      },
    ],
    error: null,
  });
  const from = vi.fn((table: string) => {
    if (table === "pull_requests") return pullRequestQuery;
    if (table === "studies") return studyQuery;
    return commentQuery;
  });
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: "user-1" } : null },
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { provider_token: "github-token" } },
      }),
    },
    from,
  };
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return { client, from };
}

function mockPostSupabase({
  filePath = null,
  lineNumber = null,
}: {
  filePath?: string | null;
  lineNumber?: number | null;
} = {}) {
  const pullRequestQuery = query({
    data: { id: prId, study_id: studyId, github_pr_number: 1060 },
    error: null,
  });
  const memberQuery = query({
    data: {
      id: "member-1",
      display_name: "Kirby",
      github_login: "tomchaccom",
      avatar_url: null,
    },
    error: null,
  });
  const studyQuery = query({
    data: { github_owner: "algo-gongbu", github_repo: "algo-study" },
    error: null,
  });
  const commentQuery = query({
    data: {
      id: "comment-2",
      body: "반례도 확인해보세요.",
      file_path: filePath,
      line_number: lineNumber,
      created_at: "2026-08-17T02:00:00.000Z",
    },
    error: null,
  });
  const from = vi.fn((table: string) => {
    if (table === "pull_requests") return pullRequestQuery;
    if (table === "members") return memberQuery;
    if (table === "studies") return studyQuery;
    return commentQuery;
  });
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { provider_token: "github-token" } },
      }),
    },
    from,
  };
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  return { commentQuery };
}

describe("pull request detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchGitHubPullRequestDetails).mockResolvedValue({
      problem: {
        filename: "member/problem/README.md",
        markdown: "# 문제 설명",
        truncated: false,
      },
      codeFiles: [],
    });
  });

  it("rejects a request without a signed-in user", async () => {
    const { from } = mockGetSupabase({ authenticated: false });

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: prId }),
    });

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a comment from a signed-out user", async () => {
    const { from } = mockGetSupabase({ authenticated: false });

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({
          body: "로그인하지 않은 댓글",
          filePath: "solution.ts",
          lineNumber: 1,
        }),
      }),
      { params: Promise.resolve({ id: prId }) },
    );

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns GitHub files and internal study comments", async () => {
    mockGetSupabase();

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: prId }),
    });
    const value = await response.json();

    expect(response.status).toBe(200);
    expect(value.problem.markdown).toBe("# 문제 설명");
    expect(value.comments[0]).toMatchObject({
      body: "좋은 풀이예요!",
      filePath: null,
      lineNumber: null,
      author: { githubLogin: "tomchaccom" },
    });
  });

  it("keeps storing a general comment without a code location", async () => {
    const { commentQuery } = mockPostSupabase();

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ body: "  반례도 확인해보세요.  " }),
      }),
      { params: Promise.resolve({ id: prId }) },
    );
    const value = await response.json();

    expect(response.status).toBe(201);
    expect(commentQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        pull_request_id: prId,
        member_id: "member-1",
        user_id: "user-1",
        body: "반례도 확인해보세요.",
        file_path: null,
        line_number: null,
      }),
    );
    expect(value.comment.author.githubLogin).toBe("tomchaccom");
    expect(value.comment.filePath).toBeNull();
    expect(value.comment.lineNumber).toBeNull();
  });

  it("stores a comment on an existing code line", async () => {
    const filePath = "members/tomchaccom/Solution.java";
    const { commentQuery } = mockPostSupabase({ filePath, lineNumber: 2 });
    vi.mocked(fetchGitHubPullRequestDetails).mockResolvedValue({
      problem: null,
      codeFiles: [
        {
          filename: filePath,
          content: "class Solution {\n  return true;\n}",
          language: "java",
          truncated: false,
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({
          body: "이 조건은 왜 필요한가요?",
          filePath: `  ${filePath}  `,
          lineNumber: 2,
        }),
      }),
      { params: Promise.resolve({ id: prId }) },
    );
    const value = await response.json();

    expect(response.status).toBe(201);
    expect(commentQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "이 조건은 왜 필요한가요?",
        file_path: filePath,
        line_number: 2,
      }),
    );
    expect(value.comment).toMatchObject({
      filePath,
      lineNumber: 2,
    });
  });

  it("rejects a line that does not exist in the PR code", async () => {
    const filePath = "members/tomchaccom/Solution.java";
    const { commentQuery } = mockPostSupabase();
    vi.mocked(fetchGitHubPullRequestDetails).mockResolvedValue({
      problem: null,
      codeFiles: [
        {
          filename: filePath,
          content: "first line\nsecond line",
          language: "java",
          truncated: false,
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({
          body: "여기에 댓글을 달게요.",
          filePath,
          lineNumber: 3,
        }),
      }),
      { params: Promise.resolve({ id: prId }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "해당 PR 코드에 존재하지 않는 위치입니다.",
    });
    expect(commentQuery.insert).not.toHaveBeenCalled();
  });

  it("validates blank and oversized comments", () => {
    expect(parseCommentBody({ body: "   " })).toBeNull();
    expect(parseCommentBody({ body: "a".repeat(2001) })).toBeNull();
    expect(parseCommentBody({ body: " 확인했어요. " })).toBe("확인했어요.");
  });

  it("requires a complete and bounded code location", () => {
    expect(
      parseCommentInput({ body: "확인", filePath: "solution.ts" }),
    ).toBeNull();
    expect(
      parseCommentInput({ body: "확인", filePath: "", lineNumber: 1 }),
    ).toBeNull();
    expect(
      parseCommentInput({ body: "확인", filePath: "solution.ts", lineNumber: 0 }),
    ).toBeNull();
    expect(
      parseCommentInput({
        body: "확인",
        filePath: "a".repeat(1001),
        lineNumber: 1,
      }),
    ).toBeNull();
    expect(
      parseCommentInput({
        body: "확인",
        filePath: "solution.ts",
        lineNumber: 1.5,
      }),
    ).toBeNull();
  });
});
