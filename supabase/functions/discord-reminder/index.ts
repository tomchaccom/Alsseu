import { createClient } from "@supabase/supabase-js";
import { getStudyWeek } from "../_shared/study-week.ts";

type Study = {
  id: string;
  name: string;
  github_owner: string;
  github_repo: string;
  weekly_quota: number;
};

type Member = {
  github_login: string;
  display_name: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  const suppliedSecret = request.headers.get("x-cron-secret");
  if (!cronSecret || suppliedSecret !== cronSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const discordWebhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!supabaseUrl || !serviceRoleKey || !discordWebhookUrl) {
    return json({ error: "server_not_configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const week = getStudyWeek();
  const { data: studies, error: studiesError } = await supabase
    .from("studies")
    .select("id,name,github_owner,github_repo,weekly_quota");

  if (studiesError) return json({ error: "study_lookup_failed" }, 500);

  const results: Array<{ studyId: string; status: string; targets: number }> = [];

  for (const study of (studies ?? []) as Study[]) {
    const { data: existing } = await supabase
      .from("notification_deliveries")
      .select("status")
      .eq("study_id", study.id)
      .eq("week_start", week.weekStart)
      .eq("kind", "deadline_3h")
      .maybeSingle();

    if (existing?.status === "sent" || existing?.status === "skipped") {
      results.push({ studyId: study.id, status: "already_processed", targets: 0 });
      continue;
    }

    const [{ data: members, error: membersError }, { data: pullRequests, error: prsError }] =
      await Promise.all([
        supabase
          .from("members")
          .select("github_login,display_name")
          .eq("study_id", study.id)
          .eq("status", "active"),
        supabase
          .from("pull_requests")
          .select("github_login")
          .eq("study_id", study.id)
          .not("merged_at", "is", null)
          .gte("merged_at", week.startsAt)
          .lte("merged_at", week.endsAt),
      ]);

    if (membersError || prsError) {
      results.push({ studyId: study.id, status: "query_failed", targets: 0 });
      continue;
    }

    const counts = new Map<string, number>();
    for (const pullRequest of pullRequests ?? []) {
      const login = pullRequest.github_login.toLowerCase();
      counts.set(login, (counts.get(login) ?? 0) + 1);
    }

    const targets = ((members ?? []) as Member[])
      .map((member) => ({
        ...member,
        solvedCount: counts.get(member.github_login.toLowerCase()) ?? 0,
      }))
      .filter((member) => member.solvedCount < 5);

    const status = targets.length ? "pending" : "skipped";
    const { error: deliveryError } = await supabase
      .from("notification_deliveries")
      .upsert(
        {
          study_id: study.id,
          week_start: week.weekStart,
          kind: "deadline_3h",
          status,
          target_logins: targets.map((member) => member.github_login),
          error_message: null,
        },
        { onConflict: "study_id,week_start,kind" },
      );

    if (deliveryError) {
      results.push({ studyId: study.id, status: "delivery_record_failed", targets: targets.length });
      continue;
    }

    if (!targets.length) {
      results.push({ studyId: study.id, status: "skipped", targets: 0 });
      continue;
    }

    const description = targets
      .map((member) => `• **${member.display_name}** (@${member.github_login}) — ${member.solvedCount}/5`)
      .join("\n");
    const discordResponse = await fetch(discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "알쓰 마감 알림",
        content: "⏰ 이번 주 알고리즘 스터디 마감까지 3시간 남았어요.",
        embeds: [
          {
            title: `${study.name} · 아직 5문제 미만`,
            description,
            color: 50289,
            fields: [
              {
                name: "원본 레포",
                value: `[${study.github_owner}/${study.github_repo}](https://github.com/${study.github_owner}/${study.github_repo})`,
              },
            ],
            footer: { text: "일요일 23:59 KST 마감 · merge된 PR만 집계" },
          },
        ],
      }),
    });

    if (!discordResponse.ok) {
      const errorMessage = (await discordResponse.text()).slice(0, 500);
      await supabase
        .from("notification_deliveries")
        .update({ status: "failed", error_message: errorMessage })
        .eq("study_id", study.id)
        .eq("week_start", week.weekStart)
        .eq("kind", "deadline_3h");
      results.push({ studyId: study.id, status: "failed", targets: targets.length });
      continue;
    }

    await supabase
      .from("notification_deliveries")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("study_id", study.id)
      .eq("week_start", week.weekStart)
      .eq("kind", "deadline_3h");
    results.push({ studyId: study.id, status: "sent", targets: targets.length });
  }

  return json({ ok: true, weekStart: week.weekStart, results });
});
