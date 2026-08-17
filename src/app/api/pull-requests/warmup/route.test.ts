import { beforeEach, describe, expect, it, vi } from "vitest";
import { schedulePullRequestContentWarmup } from "@/lib/pull-request-content-warmup";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/pull-request-content-warmup", () => ({
  schedulePullRequestContentWarmup: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

function query(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    single: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.lte.mockResolvedValue(result);
  builder.single.mockResolvedValue(result);
  return builder;
}

function mockSupabase({ authenticated = true } = {}) {
  const studyQuery = query({
    data: {
      id: "study-1",
      github_owner: "algo-gongbu",
      github_repo: "algo-study",
    },
    error: null,
  });
  const pullRequestQuery = query({
    data: [{ github_pr_number: 1060 }, { github_pr_number: 1059 }],
    error: null,
  });
  const from = vi.fn((table: string) =>
    table === "studies" ? studyQuery : pullRequestQuery
  );
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: "user-1" } : null },
      }),
    },
    from,
  };
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  );

  return { from };
}

describe("pull request warmup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a signed-out warmup request", async () => {
    const { from } = mockSupabase({ authenticated: false });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(schedulePullRequestContentWarmup).not.toHaveBeenCalled();
  });

  it("schedules recent PR caching independently from dashboard rendering", async () => {
    mockSupabase();

    const response = await POST();

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ scheduled: 2 });
    expect(schedulePullRequestContentWarmup).toHaveBeenCalledWith({
      owner: "algo-gongbu",
      repo: "algo-study",
      pullRequestNumbers: [1060, 1059],
    });
  });
});
