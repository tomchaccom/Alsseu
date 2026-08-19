import type {
  PullRequestCodeFile,
  PullRequestDetails,
} from "@/domain/types";
import { unstable_cache } from "next/cache";

type GitHubPullRequestFile = {
  filename: string;
  status: string;
  raw_url: string | null;
};

type GitHubFile = {
  filename: string;
  rawUrl: string;
};

const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "dart",
  "go",
  "java",
  "js",
  "jsx",
  "kt",
  "kts",
  "php",
  "py",
  "rb",
  "rs",
  "scala",
  "sql",
  "swift",
  "ts",
  "tsx",
]);

const MAX_PROBLEM_LENGTH = 50_000;
const MAX_CODE_LENGTH = 30_000;
const MAX_CODE_FILES = 8;
export const PULL_REQUEST_CONTENT_CACHE_SECONDS = 60 * 60 * 24 * 14;

function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function selectPullRequestFiles(files: GitHubPullRequestFile[]) {
  const available = files.filter(
    (file): file is GitHubPullRequestFile & { raw_url: string } =>
      file.status !== "removed" && Boolean(file.raw_url),
  );
  const markdownFiles = available.filter((file) =>
    file.filename.toLowerCase().endsWith(".md"),
  );
  const problem =
    markdownFiles.find(
      (file) =>
        file.filename.includes("/") &&
        file.filename.split("/").pop()?.toLowerCase() === "readme.md",
    ) ??
    markdownFiles.find(
      (file) => file.filename.split("/").pop()?.toLowerCase() === "readme.md",
    ) ??
    markdownFiles[0] ??
    null;
  const codeFiles = available
    .filter((file) => CODE_EXTENSIONS.has(extensionOf(file.filename)))
    .slice(0, MAX_CODE_FILES);

  return {
    problem: problem
      ? { filename: problem.filename, rawUrl: problem.raw_url }
      : null,
    codeFiles: codeFiles.map((file) => ({
      filename: file.filename,
      rawUrl: file.raw_url,
    })),
  };
}

export function truncateContent(content: string, maxLength: number) {
  if (content.length <= maxLength) {
    return { content, truncated: false };
  }

  return {
    content: content.slice(0, maxLength),
    truncated: true,
  };
}

function assertGitHubRawUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (
    url.protocol !== "https:" ||
    !["github.com", "raw.githubusercontent.com"].includes(url.hostname)
  ) {
    throw new Error("GitHub에서 제공한 파일 주소가 아닙니다.");
  }
}

async function readRawFile(file: GitHubFile, maxLength: number) {
  assertGitHubRawUrl(file.rawUrl);
  const response = await fetch(file.rawUrl, {
    cache: "no-store",
    headers: { Accept: "text/plain" },
  });

  if (!response.ok) {
    throw new Error(`GitHub 파일을 불러오지 못했습니다. (${response.status})`);
  }

  const value = truncateContent(await response.text(), maxLength);
  return { filename: file.filename, ...value };
}

async function loadGitHubPullRequestDetails({
  owner,
  repo,
  number,
}: {
  owner: string;
  repo: string;
  number: number;
}): Promise<Pick<PullRequestDetails, "problem" | "codeFiles">> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/files?per_page=100`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Alsseu-dashboard",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub PR을 불러오지 못했습니다. (${response.status})`);
  }

  const files = (await response.json()) as GitHubPullRequestFile[];
  const selected = selectPullRequestFiles(files);
  const [problem, codeFiles] = await Promise.all([
    selected.problem
      ? readRawFile(selected.problem, MAX_PROBLEM_LENGTH)
      : Promise.resolve(null),
    Promise.all(
      selected.codeFiles.map(async (file): Promise<PullRequestCodeFile> => {
        const result = await readRawFile(file, MAX_CODE_LENGTH);
        return {
          ...result,
          language: extensionOf(file.filename),
        };
      }),
    ),
  ]);

  return {
    problem: problem
      ? {
          filename: problem.filename,
          markdown: problem.content,
          truncated: problem.truncated,
        }
      : null,
    codeFiles,
  };
}

const readCachedGitHubPullRequestDetails = unstable_cache(
  async (owner: string, repo: string, number: number) =>
    loadGitHubPullRequestDetails({ owner, repo, number }),
  ["github-pull-request-content-v2"],
  {
    revalidate: PULL_REQUEST_CONTENT_CACHE_SECONDS,
    tags: ["github-pull-request-content"],
  },
);

export async function fetchGitHubPullRequestDetails({
  owner,
  repo,
  number,
}: {
  owner: string;
  repo: string;
  number: number;
}): Promise<Pick<PullRequestDetails, "problem" | "codeFiles">> {
  return readCachedGitHubPullRequestDetails(owner, repo, number);
}
