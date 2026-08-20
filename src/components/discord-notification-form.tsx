"use client";

import { useActionState } from "react";
import {
  sendDiscordNotification,
  type DiscordNotificationState,
} from "@/app/admin/actions";
import styles from "@/app/admin/admin.module.css";

const initialState: DiscordNotificationState = { result: "idle", message: "" };

type Props = {
  kind: "deadline_3h" | "penalty_announcement";
  label: string;
  description: string;
};

export function DiscordNotificationForm({ kind, label, description }: Props) {
  const [state, formAction, pending] = useActionState(
    sendDiscordNotification,
    initialState,
  );

  return (
    <form action={formAction} className={styles.notificationRow}>
      <div>
        <strong className={styles.notificationLabel}>{label}</strong>
        <p className={styles.notificationDescription}>{description}</p>
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
      </div>
      <input type="hidden" name="kind" value={kind} />
      <button type="submit" className={styles.statusButton} disabled={pending}>
        {pending ? "전송 중…" : "알림 보내기"}
      </button>
    </form>
  );
}
