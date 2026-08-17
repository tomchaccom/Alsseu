import { LockKeyhole } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <main className="error-shell">
      <section className="error-card glass-card">
        <span className="summary-icon"><LockKeyhole size={20} aria-hidden="true" /></span>
        <p className="eyebrow">MEMBERS ONLY</p>
        <h1>등록된 스터디 멤버가 아니에요</h1>
        <p>원본 레포의 스터디 멤버로 등록된 GitHub 계정만 이용할 수 있어요.</p>
        <a className="secondary-button" href="/login">다른 GitHub 계정으로 로그인</a>
      </section>
    </main>
  );
}
