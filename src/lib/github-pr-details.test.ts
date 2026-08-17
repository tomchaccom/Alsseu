import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cacheState = vi.hoisted(
  () => new Map<string, Promise<unknown>>(),
);

vi.mock("next/cache", () => ({
  unstable_cache:
    <Arguments extends unknown[], Result>(
      callback: (...args: Arguments) => Promise<Result>,
      keyParts: string[] = [],
    ) =>
    (...args: Arguments) => {
      const key = JSON.stringify([keyParts, args]);
      const cached = cacheState.get(key) as Promise<Result> | undefined;
      if (cached) return cached;

      const pending = callback(...args).catch((error) => {
        cacheState.delete(key);
        throw error;
      });
      cacheState.set(key, pending);
      return pending;
    },
}));

import {
  fetchGitHubPullRequestDetails,
  PULL_REQUEST_CONTENT_CACHE_SECONDS,
  selectPullRequestFiles,
  truncateContent,
} from "./github-pr-details";

beforeEach(() => {
  cacheState.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub PR file details", () => {
  it("selects the problem README and solution source files", () => {
    const selected = selectPullRequestFiles([
      {
        filename: "member/프로그래머스/problem/README.md",
        status: "added",
        raw_url: "https://github.com/example/readme",
      },
      {
        filename: "member/프로그래머스/problem/solution.java",
        status: "added",
        raw_url: "https://github.com/example/code",
      },
      {
        filename: "member/image.png",
        status: "added",
        raw_url: "https://github.com/example/image",
      },
      {
        filename: "member/old.py",
        status: "removed",
        raw_url: null,
      },
    ]);

    expect(selected.problem?.filename).toContain("README.md");
    expect(selected.codeFiles).toEqual([
      {
        filename: "member/프로그래머스/problem/solution.java",
        rawUrl: "https://github.com/example/code",
      },
    ]);
  });

  it("marks content that exceeds the display limit as truncated", () => {
    expect(truncateContent("12345", 3)).toEqual({
      content: "123",
      truncated: true,
    });
    expect(truncateContent("123", 3)).toEqual({
      content: "123",
      truncated: false,
    });
  });

  it("caches public markdown and code by repository and PR number", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              filename: "member/problem/README.md",
              status: "added",
              raw_url: "https://github.com/example/readme",
            },
            {
              filename: "member/problem/solution.py",
              status: "added",
              raw_url: "https://raw.githubusercontent.com/example/code",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response("# 문제 설명", { status: 200 }))
      .mockResolvedValueOnce(
        new Response("def solution():\n    return 1", { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const details = await fetchGitHubPullRequestDetails({
      owner: "algo-gongbu",
      repo: "algo-study",
      number: 1060,
    });
    const cachedDetails = await fetchGitHubPullRequestDetails({
      owner: "algo-gongbu",
      repo: "algo-study",
      number: 1060,
    });

    expect(details.problem?.markdown).toBe("# 문제 설명");
    expect(details.codeFiles[0]).toMatchObject({
      filename: "member/problem/solution.py",
      language: "py",
      content: "def solution():\n    return 1",
    });
    expect(cachedDetails).toEqual(details);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/pulls/1060/files"),
      expect.objectContaining({
        cache: "no-store",
        headers: expect.not.objectContaining({
          Authorization: expect.anything(),
        }),
      }),
    );
    expect(PULL_REQUEST_CONTENT_CACHE_SECONDS).toBe(1_209_600);
  });

  it("keeps different pull requests in separate cache entries", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes("api.github.com")) {
        const number = url.includes("/1060/") ? 1060 : 1061;
        return new Response(
          JSON.stringify([
            {
              filename: `member/problem-${number}/README.md`,
              status: "added",
              raw_url: `https://github.com/example/readme-${number}`,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(`# ${url.split("-").pop()}`, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchGitHubPullRequestDetails({
      owner: "algo-gongbu",
      repo: "algo-study",
      number: 1060,
    });
    const second = await fetchGitHubPullRequestDetails({
      owner: "algo-gongbu",
      repo: "algo-study",
      number: 1061,
    });

    expect(first.problem?.markdown).toBe("# 1060");
    expect(second.problem?.markdown).toBe("# 1061");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not cache failed GitHub responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const load = () =>
      fetchGitHubPullRequestDetails({
        owner: "algo-gongbu",
        repo: "algo-study",
        number: 1060,
      });

    await expect(load()).rejects.toThrow(
      "GitHub PR을 불러오지 못했습니다. (429)",
    );
    await expect(load()).rejects.toThrow(
      "GitHub PR을 불러오지 못했습니다. (429)",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
