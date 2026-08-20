import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatKoreanWeek, getStudyWeek } from "@/domain/study";
import { getSampleDashboard } from "@/lib/sample-data";
import { DashboardShell } from "./dashboard-shell";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("DashboardShell", () => {
  it("shows a GitHub profile image when a member has an avatar URL", () => {
    const data = getSampleDashboard(new Date("2026-08-12T03:00:00.000Z"));
    data.members[0].avatarUrl =
      "https://avatars.githubusercontent.com/u/134512691?v=4";

    render(<DashboardShell data={data} initialNow={data.syncedAt} />);

    expect(
      screen.getByRole("img", { name: "김알고 GitHub 프로필" }),
    ).toBeTruthy();
  });

  it("links to the previous week and member management views", () => {
    const data = getSampleDashboard(new Date("2026-08-12T03:00:00.000Z"));

    render(<DashboardShell data={data} initialNow={data.syncedAt} />);

    expect(
      screen.getByRole("link", { name: "지난 주차" }).getAttribute("href"),
    ).toBe("/?week=previous");
    expect(
      screen.getByRole("link", { name: "멤버 관리" }).getAttribute("href"),
    ).toBe("/admin");
  });

  it("shows the final-three-hours warning and opens a PR detail", () => {
    const data = getSampleDashboard(
      new Date("2026-08-12T03:00:00.000Z"),
      "warning",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ problem: null, codeFiles: [], comments: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<DashboardShell data={data} initialNow={data.syncedAt} />);

    expect(screen.getByText(/마감까지 2시간/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /PR #/ })[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("link", { name: /GitHub에서 보기/ })).toBeTruthy();
  });

  it("opens a completed problem slot and posts an internal study comment", async () => {
    const data = getSampleDashboard(new Date("2026-08-12T03:00:00.000Z"));
    const pullRequest = data.members[0].pullRequests[data.members[0].solvedCount - 1];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            problem: {
              filename: "member/problem/README.md",
              markdown: "# 마지막 두 원소\n\n문제 설명입니다.",
              truncated: false,
            },
            codeFiles: [
              {
                filename: "member/problem/solution.c",
                content: "int solution(void) { return 1; }",
                language: "c",
                truncated: false,
              },
            ],
            comments: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            comment: {
              id: "comment-1",
              body: "반례도 확인해보세요.",
              filePath: null,
              lineNumber: null,
              createdAt: "2026-08-17T02:00:00.000Z",
              author: {
                displayName: "Kirby",
                githubLogin: "tomchaccom",
                avatarUrl: null,
              },
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardShell data={data} initialNow={data.syncedAt} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: `${data.members[0].displayName} 1번 문제 PR #${pullRequest.number} 열기`,
      }),
    );

    expect(await screen.findByRole("heading", { name: "마지막 두 원소" })).toBeTruthy();
    expect(screen.getByText("int solution(void) { return 1; }")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("댓글 작성"), {
      target: { value: "반례도 확인해보세요." },
    });
    fireEvent.click(screen.getByRole("button", { name: /댓글 남기기/ }));

    expect(await screen.findByText("반례도 확인해보세요.")).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/pull-requests/${pullRequest.id}`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      body: "반례도 확인해보세요.",
      filePath: null,
      lineNumber: null,
    });
  });

  it("posts and renders a comment directly beneath a selected code line", async () => {
    const data = getSampleDashboard(new Date("2026-08-12T03:00:00.000Z"));
    const pullRequest = data.members[0].pullRequests[data.members[0].solvedCount - 1];
    const filename = "member/problem/solution.c";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            problem: {
              filename: "member/problem/README.md",
              markdown: "# 배열 뒤집기\n\n문제 설명입니다.",
              truncated: false,
            },
            codeFiles: [
              {
                filename,
                content: "int solution(void) {\n  return 1;\n}",
                language: "c",
                truncated: false,
              },
            ],
            comments: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            comment: {
              id: "line-comment-1",
              body: "이 반환값은 상수여도 괜찮나요?",
              filePath: filename,
              lineNumber: 2,
              createdAt: "2026-08-17T02:00:00.000Z",
              author: {
                displayName: "Kirby",
                githubLogin: "tomchaccom",
                avatarUrl: null,
              },
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardShell data={data} initialNow={data.syncedAt} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: `${data.members[0].displayName} 1번 문제 PR #${pullRequest.number} 열기`,
      }),
    );

    expect(await screen.findByRole("heading", { name: "배열 뒤집기" })).toBeTruthy();
    expect(screen.getByText("return 1;", { exact: false })).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: `${filename} 2번 줄에 댓글 작성` }),
    );
    fireEvent.change(screen.getByLabelText("2번 줄 댓글"), {
      target: { value: "이 반환값은 상수여도 괜찮나요?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /줄 댓글 남기기/ }));

    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      body: "이 반환값은 상수여도 괜찮나요?",
      filePath: filename,
      lineNumber: 2,
    });
    const reviewedLine = screen.getByRole("listitem", {
      name: `${filename} 2번 줄 리뷰`,
    });
    expect(
      await within(reviewedLine).findByText("이 반환값은 상수여도 괜찮나요?"),
    ).toBeTruthy();
  });

  it("starts one cache warmup request after the initial render", async () => {
    const data = getSampleDashboard(new Date("2026-08-12T03:00:00.000Z"));
    data.source = "supabase";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ scheduled: 35 }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    render(<DashboardShell data={data} initialNow={data.syncedAt} />);

    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pull-requests/warmup",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("switches to the previous week immediately without a server request", () => {
    const data = getSampleDashboard(new Date("2026-08-12T03:00:00.000Z"));
    const previousWeek = getStudyWeek(new Date("2026-08-05T03:00:00.000Z"));
    data.weekViews = {
      current: {
        week: data.week,
        members: data.members,
        activity: data.activity,
      },
      previous: {
        week: previousWeek,
        members: data.members.map((member) => ({
          ...member,
          solvedCount: 0,
          remainingCount: 5,
          completed: false,
          pullRequests: [],
        })),
        activity: [],
      },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardShell data={data} initialNow={data.syncedAt} />);
    fireEvent.click(screen.getByRole("link", { name: "지난 주차" }));

    expect(
      screen.getByText(`${formatKoreanWeek(previousWeek)} · 주간 5문제`),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?week=previous");
  });

  it("reveals penalty targets only after the week is closed", () => {
    const data = getSampleDashboard(
      new Date("2026-08-12T03:00:00.000Z"),
      "closed",
    );
    render(<DashboardShell data={data} initialNow={data.syncedAt} />);

    expect(
      screen.getByRole("heading", { name: "벌금 제출 대상" }),
    ).toBeTruthy();
    expect(screen.getByText("박코딩", { selector: ".penalty-members *" })).toBeTruthy();
    expect(screen.queryByText("최휴면", { selector: ".penalty-members *" })).toBeNull();
  });
});
