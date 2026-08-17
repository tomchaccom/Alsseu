import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberStatusForm } from "./member-status-form";

vi.mock("@/app/admin/actions", () => ({
  updateMemberStatus: vi.fn(),
}));

describe("MemberStatusForm", () => {
  it("prevents the current admin from making their own account dormant", () => {
    render(
      <MemberStatusForm
        memberId="11111111-1111-4111-8111-111111111111"
        status="active"
        isCurrentAdmin
      />,
    );

    expect(
      screen.getByRole("button", { name: "휴면 전환" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText("관리자 본인은 휴면 처리할 수 없어요."),
    ).toBeTruthy();
  });

  it("allows a dormant member to be restored", () => {
    render(
      <MemberStatusForm
        memberId="22222222-2222-4222-8222-222222222222"
        status="dormant"
        isCurrentAdmin={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "활성 복귀" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
