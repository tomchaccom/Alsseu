import { createClient } from "@supabase/supabase-js";

type PullRequestPayload = {
  action: string;
  repository: { full_name: string; owner: { login: string }; name: string };
  pull_request: {
    number: number;
    node_id: string;
    title: string;
    html_url: string;
    state: "open" | "closed";
    merged: boolean;
    created_at: string;
    merged_at: string | null;
    additions: number;
    deletions: number;
    changed_files: number;
    user: { login: string };
    head: { ref: string };
  };
};

const encoder = new TextEncoder();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function verifySignature(body: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body)),
  );
  const expected = `sha256=${Array.from(signed, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;

  if (expected.length !== signature.length) return false;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return mismatch === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("GITHUB_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "server_not_configured" }, 500);
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!(await verifySignature(body, signature, secret))) {
    return json({ error: "invalid_signature" }, 401);
  }

  const eventName = request.headers.get("x-github-event") ?? "unknown";
  if (eventName === "ping") return json({ ok: true, event: "ping" });
  if (eventName !== "pull_request") return json({ ok: true, ignored: eventName });

  const deliveryId = request.headers.get("x-github-delivery");
  if (!deliveryId) return json({ error: "missing_delivery_id" }, 400);

  let payload: PullRequestPayload;
  try {
    payload = JSON.parse(body) as PullRequestPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const acceptedActions = new Set(["opened", "edited", "reopened", "synchronize", "closed"]);
  if (!acceptedActions.has(payload.action)) {
    return json({ ok: true, ignored: payload.action });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: study, error: studyError } = await supabase
    .from("studies")
    .select("id")
    .eq("github_owner", payload.repository.owner.login)
    .eq("github_repo", payload.repository.name)
    .maybeSingle();

  if (studyError) return json({ error: "study_lookup_failed" }, 500);
  if (!study) return json({ ok: true, ignored: "repository_not_registered" }, 202);

  const { error: deliveryError } = await supabase.from("webhook_deliveries").insert({
    delivery_id: deliveryId,
    event_name: eventName,
    repository_full_name: payload.repository.full_name,
  });

  if (deliveryError?.code === "23505") {
    return json({ ok: true, duplicate: true });
  }
  if (deliveryError) return json({ error: "delivery_record_failed" }, 500);

  const pullRequest = payload.pull_request;
  const { error: upsertError } = await supabase.from("pull_requests").upsert(
    {
      study_id: study.id,
      github_pr_number: pullRequest.number,
      github_node_id: pullRequest.node_id,
      github_login: pullRequest.user.login,
      title: pullRequest.title,
      html_url: pullRequest.html_url,
      head_branch: pullRequest.head.ref,
      state: pullRequest.merged ? "merged" : pullRequest.state,
      opened_at: pullRequest.created_at,
      merged_at: pullRequest.merged_at,
      additions: pullRequest.additions,
      deletions: pullRequest.deletions,
      changed_files: pullRequest.changed_files,
    },
    { onConflict: "study_id,github_pr_number" },
  );

  if (upsertError) {
    await supabase.from("webhook_deliveries").delete().eq("delivery_id", deliveryId);
    return json({ error: "pull_request_upsert_failed" }, 500);
  }

  return json({ ok: true, pullRequest: pullRequest.number });
});
