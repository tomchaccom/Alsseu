import { redirect } from "next/navigation";
import { LoginButton } from "@/components/login-button";
import { isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  if (isDemoMode()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="login-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <section className="login-card glass-card">
        <div className="brand-lockup brand-lockup--centered">
          <span className="brand-slots" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>알쓰</span>
        </div>
        <p className="eyebrow">ALGORITHM STUDY</p>
        <h1>이번 주의 꾸준함을<br />한눈에 확인하세요</h1>
        <p className="login-description">
          GitHub PR로 주간 5문제 진행률을 확인하고 마감 전에 함께 완주해요.
        </p>
        <LoginButton />
        <small>등록된 스터디 GitHub 계정만 이용할 수 있어요.</small>
      </section>
    </main>
  );
}
