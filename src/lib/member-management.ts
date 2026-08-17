import { redirect } from "next/navigation";
import type { MemberStatus } from "@/domain/types";
import { getStudySlug } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type AdminMembershipRow = {
  id: string;
  is_admin: boolean;
};

type ManagedMemberRow = {
  id: string;
  display_name: string;
  github_login: string;
  status: MemberStatus;
};

export type ManagedMember = {
  id: string;
  displayName: string;
  githubLogin: string;
  status: MemberStatus;
};

export type MemberManagementData = {
  studyName: string;
  currentMemberId: string;
  members: ManagedMember[];
};

export async function getMemberManagementData(): Promise<MemberManagementData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: study, error: studyError } = await supabase
    .from("studies")
    .select("id,name")
    .eq("slug", getStudySlug())
    .single();

  if (studyError || !study) redirect("/unauthorized");

  const { data: adminMembership, error: adminError } = await supabase
    .from("members")
    .select("id,is_admin")
    .eq("study_id", study.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const membership = adminMembership as AdminMembershipRow | null;
  if (adminError || !membership?.is_admin) redirect("/");

  const { data: memberRows, error: memberError } = await supabase
    .from("members")
    .select("id,display_name,github_login,status")
    .eq("study_id", study.id)
    .order("display_name");

  if (memberError || !memberRows) {
    throw new Error("멤버 목록을 불러오지 못했습니다.");
  }

  return {
    studyName: study.name,
    currentMemberId: membership.id,
    members: (memberRows as ManagedMemberRow[]).map((member) => ({
      id: member.id,
      displayName: member.display_name,
      githubLogin: member.github_login,
      status: member.status,
    })),
  };
}
