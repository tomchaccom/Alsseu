import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");
  const next = nextParam?.startsWith("/") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: linked, error: linkError } = await supabase.rpc(
        "link_current_github_member",
      );

      if (!linkError && linked) {
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }

      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/unauthorized", requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth", requestUrl.origin));
}
