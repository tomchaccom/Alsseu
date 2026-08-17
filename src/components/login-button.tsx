"use client";

import { GitFork } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) setPending(false);
  }

  return (
    <button
      className="github-button"
      type="button"
      onClick={signIn}
      disabled={pending}
    >
      <GitFork size={20} aria-hidden="true" />
      {pending ? "GitHub로 이동 중…" : "GitHub로 시작하기"}
    </button>
  );
}
