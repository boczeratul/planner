/**
 * Human-readable date for the Nth trip day, e.g. dateForDay("2026-07-03", 2)
 * -> "Sat, Jul 4". Returns null when no valid start date is known.
 * Parses Y/M/D into a local Date — `new Date("YYYY-MM-DD")` would be UTC and
 * can shift a day depending on the user's timezone.
 */
export function dateForDay(startDate: string | undefined, day: number): string | null {
  if (!startDate) return null;
  const m = startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (day - 1));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
