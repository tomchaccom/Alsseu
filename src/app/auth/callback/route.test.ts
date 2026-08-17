import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

type AuthClient = Awaited<ReturnType<typeof createClient>>;

type MockSupabaseOptions = {
  linked?: boolean;
  exchangeError?: Error | null;
};

function mockSupabase({
  linked = true,
  exchangeError = null,
}: MockSupabaseOptions = {}) {
  const exchangeCodeForSession = vi.fn().mockResolvedValue({
    error: exchangeError,
  });
  const rpc = vi.fn().mockResolvedValue({ data: linked, error: null });
  const signOut = vi.fn().mockResolvedValue({ error: null });

  vi.mocked(createClient).mockResolvedValue({
    auth: { exchangeCodeForSession, signOut },
    rpc,
  } as unknown as AuthClient);

  return { exchangeCodeForSession, rpc, signOut };
}

describe("GitHub OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links a registered GitHub member and redirects to the dashboard", async () => {
    const client = mockSupabase();

    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=oauth-code"),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(client.rpc).toHaveBeenCalledWith("link_current_github_member");
    expect(client.signOut).not.toHaveBeenCalled();
  });

  it("signs out an unregistered GitHub user and redirects to members-only", async () => {
    const client = mockSupabase({ linked: false });

    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=oauth-code"),
    );

    expect(client.signOut).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/unauthorized",
    );
  });

  it("returns to login when the OAuth code exchange fails", async () => {
    const client = mockSupabase({ exchangeError: new Error("invalid code") });

    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=invalid"),
    );

    expect(client.rpc).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=oauth",
    );
  });
});
