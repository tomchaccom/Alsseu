"use client";

import { useActionState } from "react";
import {
  updateMemberStatus,
  type MemberStatusActionState,
} from "@/app/admin/actions";
import type { MemberStatus } from "@/domain/types";
import styles from "@/app/admin/admin.module.css";

const initialState: MemberStatusActionState = {
  result: "idle",
  message: "",
};

type MemberStatusFormProps = {
  memberId: string;
  status: MemberStatus;
  isCurrentAdmin: boolean;
};

export function MemberStatusForm({
  memberId,
  status,
  isCurrentAdmin,
}: MemberStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updateMemberStatus,
    initialState,
  );
  const nextStatus: MemberStatus = status === "active" ? "dormant" : "active";
  const cannotMakeSelfDormant = isCurrentAdmin && nextStatus === "dormant";

  return (
    <form action={formAction} className={styles.statusForm}>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <button
        type="submit"
        className={styles.statusButton}
        disabled={pending || cannotMakeSelfDormant}
      >
        {pending
          ? "변경 중…"
          : nextStatus === "dormant"
            ? "휴면 전환"
            : "활성 복귀"}
      </button>
      {cannotMakeSelfDormant ? (
        <span className={styles.formMessage}>관리자 본인은 휴면 처리할 수 없어요.</span>
      ) : null}
      {state.message ? (
        <span
          className={
            state.result === "error" ? styles.formError : styles.formMessage
          }
          aria-live="polite"
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
