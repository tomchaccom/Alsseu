export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function isDemoMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE !== "false" || !isSupabaseConfigured()
  );
}

export function getStudySlug(): string {
  return process.env.NEXT_PUBLIC_STUDY_SLUG || "algo-study";
}
