"use client";

import { RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-shell">
      <div className="error-card glass-card">
        <span className="status-mark status-mark--warning">!</span>
        <p className="eyebrow">데이터 동기화 오류</p>
        <h1>이번 주 기록을 불러오지 못했어요</h1>
        <p>잠시 후 다시 시도해 주세요. 계속되면 Supabase 연결 상태를 확인하세요.</p>
        <button className="primary-button" type="button" onClick={reset}>
          <RotateCcw size={17} aria-hidden="true" /> 다시 시도
        </button>
      </div>
    </main>
  );
}
