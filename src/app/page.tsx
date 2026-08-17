import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard-shell";
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const data = isDemoMode()
    ? getSampleDashboard(new Date(), parseDemoState(params.state))
    : await getDashboardData();

  return <DashboardShell data={data} initialNow={data.syncedAt} />;
}
