import { LockKeyhole } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <main className="error-shell">
      <section className="error-card glass-card">
        <span className="summary-icon"><LockKeyhole size={20} aria-hidden="true" /></span>
        <p className="eyebrow">MEMBERS ONLY</p>
        <h1>등록된 스터디 멤버가 아니에요</h1>
        <p>관리자가 Supabase 멤버 목록에 GitHub 계정과 로그인 사용자를 연결하면 이용할 수 있어요.</p>
        <a className="secondary-button" href="/login">다른 GitHub 계정으로 로그인</a>
      </section>
    </main>
  );
}
