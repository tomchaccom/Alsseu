import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getSampleDashboard } from "@/lib/sample-data";
import { DashboardShell } from "./dashboard-shell";

describe("DashboardShell", () => {
  it("shows the final-three-hours warning and opens a PR detail", () => {
    const data = getSampleDashboard(
      new Date("2026-08-12T03:00:00.000Z"),
      "warning",
    );
    render(<DashboardShell data={data} initialNow={data.syncedAt} />);

    expect(screen.getByText(/마감까지 2시간/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /PR #/ })[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("link", { name: /GitHub에서 보기/ })).toBeTruthy();
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
