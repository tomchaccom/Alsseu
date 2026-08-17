import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard-shell";
import type { DashboardWeekSelection } from "@/domain/types";
import { getDashboardData } from "@/lib/dashboard-data";
import { isDemoMode } from "@/lib/env";
import { getSampleDashboard } from "@/lib/sample-data";

type DemoState = "default" | "warning" | "closed" | "complete";

function parseDemoState(value: string | string[] | undefined): DemoState {
  const state = Array.isArray(value) ? value[0] : value;
  return state === "warning" || state === "closed" || state === "complete"
    ? state
    : "default";
}

function parseWeekSelection(
  value: string | string[] | undefined,
): DashboardWeekSelection {
  const selection = Array.isArray(value) ? value[0] : value;
  return selection === "previous" ? "previous" : "current";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const now = new Date();
  const weekSelection = parseWeekSelection(params.week);
  const data = isDemoMode()
    ? getSampleDashboard(now, parseDemoState(params.state))
    : await getDashboardData(now, weekSelection);

  return (
    <DashboardShell
      data={data}
      initialNow={data.syncedAt}
      weekSelection={weekSelection}
    />
  );
}
