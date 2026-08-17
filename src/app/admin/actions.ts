"use server";

import { revalidatePath } from "next/cache";
import type { MemberStatus } from "@/domain/types";
import { createClient } from "@/lib/supabase/server";

export type MemberStatusActionState = {
  result: "idle" | "success" | "error";
  message: string;
};

const memberIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMemberStatus(value: unknown): value is MemberStatus {
  return value === "active" || value === "dormant";
}

export async function updateMemberStatus(
  _previousState: MemberStatusActionState,
  formData: FormData,
): Promise<MemberStatusActionState> {
  const memberId = formData.get("memberId");
  const nextStatus = formData.get("nextStatus");

  if (
    typeof memberId !== "string" ||
    !memberIdPattern.test(memberId) ||
    !isMemberStatus(nextStatus)
  ) {
    return {
      result: "error",
      message: "잘못된 멤버 상태 요청입니다.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      result: "error",
      message: "다시 로그인한 뒤 시도해주세요.",
    };
  }

  const { data: updated, error } = await supabase.rpc("set_member_status", {
    target_member_id: memberId,
    target_status: nextStatus,
  });

  if (error || !updated) {
    return {
      result: "error",
      message: "관리자 권한과 멤버 상태를 확인해주세요.",
    };
  }

  revalidatePath("/");
  revalidatePath("/admin");

  return {
    result: "success",
    message:
      nextStatus === "dormant"
        ? "휴면 멤버로 전환했습니다."
        : "활성 멤버로 복귀했습니다.",
  };
}
