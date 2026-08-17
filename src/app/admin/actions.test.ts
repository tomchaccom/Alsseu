import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateMemberStatus } from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const initialState = { result: "idle" as const, message: "" };
const memberId = "11111111-1111-4111-8111-111111111111";

function makeFormData(status: "active" | "dormant", id = memberId) {
  const formData = new FormData();
  formData.set("memberId", id);
  formData.set("nextStatus", status);
  return formData;
}

function mockSupabase({
  authenticated = true,
  updated = true,
  rpcError = null,
}: {
  authenticated?: boolean;
  updated?: boolean;
  rpcError?: Error | null;
} = {}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: authenticated ? { id: "admin-user" } : null },
  });
  const rpc = vi.fn().mockResolvedValue({ data: updated, error: rpcError });

  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser },
    rpc,
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { getUser, rpc };
}

describe("updateMemberStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("changes a member to dormant through the protected RPC", async () => {
    const client = mockSupabase();

    const result = await updateMemberStatus(
      initialState,
      makeFormData("dormant"),
    );

    expect(client.rpc).toHaveBeenCalledWith("set_member_status", {
      target_member_id: memberId,
      target_status: "dormant",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(result).toEqual({
      result: "success",
      message: "휴면 멤버로 전환했습니다.",
    });
  });

  it("rejects an invalid member id before accessing Supabase", async () => {
    const result = await updateMemberStatus(
      initialState,
      makeFormData("dormant", "not-a-member-id"),
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(result.result).toBe("error");
  });

  it("does not call the RPC when the session is missing", async () => {
    const client = mockSupabase({ authenticated: false });

    const result = await updateMemberStatus(
      initialState,
      makeFormData("active"),
    );

    expect(client.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({
      result: "error",
      message: "다시 로그인한 뒤 시도해주세요.",
    });
  });

  it("returns a safe error when the database denies the change", async () => {
    mockSupabase({ rpcError: new Error("permission denied") });

    const result = await updateMemberStatus(
      initialState,
      makeFormData("dormant"),
    );

    expect(result).toEqual({
      result: "error",
      message: "관리자 권한과 멤버 상태를 확인해주세요.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
