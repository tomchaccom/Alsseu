"use server";

import { revalidatePath } from "next/cache";
import type { MemberStatus } from "@/domain/types";
import { getStudySlug } from "@/lib/env";
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

export type DiscordNotificationState = {
  result: "idle" | "success" | "error";
  message: string;
};

export async function sendDiscordNotification(
  _prev: DiscordNotificationState,
  formData: FormData,
): Promise<DiscordNotificationState> {
  const kind = formData.get("kind");
  if (kind !== "deadline_3h" && kind !== "penalty_announcement") {
    return { result: "error", message: "잘못된 알림 종류입니다." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { result: "error", message: "다시 로그인한 뒤 시도해주세요." };

  const { data: study } = await supabase
    .from("studies")
    .select("id")
    .eq("slug", getStudySlug())
    .single();
  if (!study) return { result: "error", message: "스터디를 찾을 수 없습니다." };

  const { data: membership } = await supabase
    .from("members")
    .select("is_admin")
    .eq("study_id", study.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!(membership as { is_admin: boolean } | null)?.is_admin) {
    return { result: "error", message: "관리자 권한이 필요합니다." };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cronSecret = process.env.REMINDER_CRON_SECRET;
  if (!supabaseUrl || !cronSecret) {
    return { result: "error", message: "서버 설정 오류입니다." };
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/discord-reminder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({ kind }),
    });
  } catch {
    return { result: "error", message: "Discord 함수에 연결할 수 없습니다." };
  }

  if (!res.ok) return { result: "error", message: `Discord 함수 오류 (${res.status})` };

  const data = await res.json();
  const result = data.results?.[0];
  if (!result) return { result: "error", message: "응답을 처리할 수 없습니다." };

  if (result.status === "sent") {
    return { result: "success", message: `Discord에 알림을 전송했습니다. (대상 ${result.targets}명)` };
  }
  if (result.status === "skipped") {
    return { result: "success", message: "전원 달성 완료. 알림 대상이 없습니다." };
  }
  if (result.status === "already_processed") {
    return { result: "error", message: "이미 이번 주차에 전송된 알림입니다." };
  }
  return { result: "error", message: `전송 실패 (${result.status})` };
}
