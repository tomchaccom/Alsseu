import { after } from "next/server";
import { fetchGitHubPullRequestDetails } from "@/lib/github-pr-details";

export const PULL_REQUEST_WARMUP_CONCURRENCY = 4;

export type WarmupInput = {
  owner: string;
  repo: string;
  pullRequestNumbers: number[];
};

export type WarmupResult = {
  requested: number;
  warmed: number;
  failed: number;
};

export async function warmPullRequestContents({
  owner,
  repo,
  pullRequestNumbers,
}: WarmupInput): Promise<WarmupResult> {
  const queue = [...new Set(pullRequestNumbers)];
  let cursor = 0;
  let warmed = 0;
  let failed = 0;

  async function worker() {
    while (cursor < queue.length) {
      const number = queue[cursor];
      cursor += 1;

      try {
        await fetchGitHubPullRequestDetails({ owner, repo, number });
        warmed += 1;
      } catch {
        failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PULL_REQUEST_WARMUP_CONCURRENCY, queue.length) },
      () => worker(),
    ),
  );

  return { requested: queue.length, warmed, failed };
}

export function schedulePullRequestContentWarmup(input: WarmupInput) {
  after(async () => {
    const result = await warmPullRequestContents(input);

    if (result.failed > 0) {
      console.warn(
        `Failed to warm ${result.failed}/${result.requested} GitHub PR contents.`,
      );
    }
  });
}
