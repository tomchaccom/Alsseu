import Link from "next/link";
import { MemberStatusForm } from "@/components/member-status-form";
import { getMemberManagementData } from "@/lib/member-management";
import styles from "./admin.module.css";

export default async function AdminPage() {
  const data = await getMemberManagementData();
  const activeCount = data.members.filter(
    (member) => member.status === "active",
  ).length;

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ADMIN · MEMBER MANAGEMENT</p>
            <h1>{data.studyName} 멤버 관리</h1>
            <p className={styles.description}>
              휴면 멤버는 주간 진행률과 벌금 대상에서 제외됩니다.
            </p>
          </div>
          <Link href="/" className={styles.backLink}>
            대시보드로 돌아가기
          </Link>
        </header>

        <div className={styles.summary} aria-label="멤버 상태 요약">
          <span>전체 {data.members.length}명</span>
          <span>활성 {activeCount}명</span>
          <span>휴면 {data.members.length - activeCount}명</span>
        </div>

        <ul className={styles.memberList}>
          {data.members.map((member) => {
            const isCurrentAdmin = member.id === data.currentMemberId;

            return (
              <li key={member.id} className={styles.memberRow}>
                <div className={styles.identity}>
                  <strong>{member.displayName}</strong>
                  <span>@{member.githubLogin}</span>
                  {isCurrentAdmin ? (
                    <span className={styles.adminBadge}>관리자</span>
                  ) : null}
                </div>
                <span
                  className={
                    member.status === "active"
                      ? styles.activeBadge
                      : styles.dormantBadge
                  }
                >
                  {member.status === "active" ? "활성" : "휴면"}
                </span>
                <MemberStatusForm
                  memberId={member.id}
                  status={member.status}
                  isCurrentAdmin={isCurrentAdmin}
                />
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
