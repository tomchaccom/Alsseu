import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubPullRequestDetails } from "@/lib/github-pr-details";
import {
  PULL_REQUEST_WARMUP_CONCURRENCY,
  schedulePullRequestContentWarmup,
  warmPullRequestContents,
} from "./pull-request-content-warmup";

const afterCallbacks = vi.hoisted(
  () => [] as Array<() => void | Promise<void>>,
);

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  }),
}));

vi.mock("@/lib/github-pr-details", () => ({
  fetchGitHubPullRequestDetails: vi.fn(),
}));

describe("pull request content warmup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    vi.mocked(fetchGitHubPullRequestDetails).mockResolvedValue({
      problem: null,
      codeFiles: [],
    });
  });

  it("warms each unique PR once", async () => {
    const result = await warmPullRequestContents({
      owner: "algo-gongbu",
      repo: "algo-study",
      pullRequestNumbers: [1060, 1059, 1060],
    });

    expect(result).toEqual({ requested: 2, warmed: 2, failed: 0 });
    expect(fetchGitHubPullRequestDetails).toHaveBeenCalledTimes(2);
    expect(fetchGitHubPullRequestDetails).toHaveBeenCalledWith({
      owner: "algo-gongbu",
      repo: "algo-study",
      number: 1060,
    });
  });

  it("continues warming when one PR fails", async () => {
    vi.mocked(fetchGitHubPullRequestDetails)
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValue({ problem: null, codeFiles: [] });

    const result = await warmPullRequestContents({
      owner: "algo-gongbu",
      repo: "algo-study",
      pullRequestNumbers: [1060, 1059, 1058],
    });

    expect(result).toEqual({ requested: 3, warmed: 2, failed: 1 });
    expect(PULL_REQUEST_WARMUP_CONCURRENCY).toBe(4);
  });

  it("does no work when the recent window has no PRs", async () => {
    const result = await warmPullRequestContents({
      owner: "algo-gongbu",
      repo: "algo-study",
      pullRequestNumbers: [],
    });

    expect(result).toEqual({ requested: 0, warmed: 0, failed: 0 });
    expect(fetchGitHubPullRequestDetails).not.toHaveBeenCalled();
  });

  it("does not start warming until the response has finished", async () => {
    schedulePullRequestContentWarmup({
      owner: "algo-gongbu",
      repo: "algo-study",
      pullRequestNumbers: [1060, 1059],
    });

    expect(afterCallbacks).toHaveLength(1);
    expect(fetchGitHubPullRequestDetails).not.toHaveBeenCalled();

    await afterCallbacks[0]();

    expect(fetchGitHubPullRequestDetails).toHaveBeenCalledTimes(2);
  });
});
