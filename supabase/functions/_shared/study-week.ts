const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getStudyWeek(now = new Date()) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const daysSinceMonday = (kst.getUTCDay() + 6) % 7;
  const startUtc =
    Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth(),
      kst.getUTCDate() - daysSinceMonday,
    ) - KST_OFFSET_MS;

  return {
    startsAt: new Date(startUtc).toISOString(),
    endsAt: new Date(startUtc + WEEK_MS - 1).toISOString(),
    weekStart: new Date(startUtc + KST_OFFSET_MS).toISOString().slice(0, 10),
  };
}
