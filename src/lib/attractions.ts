import type { Attraction, AttractionVote, TripPlan } from "./types";

/** The effective vote for an attraction (missing entry = neutral). */
export function voteOf(votes: Record<string, AttractionVote>, id: string): AttractionVote {
  const v = votes[id];
  return v === "up" || v === "down" ? v : "neutral";
}

/**
 * After a proposal refinement: keep the traveler's up/down votes for items
 * that survived, drop votes for removed items. New items start neutral
 * (absent from the record) — as does everything on a first proposal.
 */
export function mergeVotes(
  previous: Record<string, AttractionVote>,
  attractions: Attraction[],
): Record<string, AttractionVote> {
  const merged: Record<string, AttractionVote> = {};
  for (const a of attractions) {
    const v = previous[a.id];
    if (v === "up" || v === "down") merged[a.id] = v;
  }
  return merged;
}

/** Partition the list by vote: must include / must skip / planner's choice. */
export function groupByVote(
  attractions: Attraction[],
  votes: Record<string, AttractionVote>,
): { mustInclude: Attraction[]; mustSkip: Attraction[]; flexible: Attraction[] } {
  const mustInclude: Attraction[] = [];
  const mustSkip: Attraction[] = [];
  const flexible: Attraction[] = [];
  for (const a of attractions) {
    const v = voteOf(votes, a.id);
    (v === "up" ? mustInclude : v === "down" ? mustSkip : flexible).push(a);
  }
  return { mustInclude, mustSkip, flexible };
}

const norm = (s: string) => s.trim().toLowerCase();

// Glue words and itinerary verbs that carry no identity — ignored when
// comparing an attraction name against a block title.
const STOPWORDS = new Set([
  "a", "an", "the", "of", "and", "or", "at", "in", "on", "to", "for", "with",
  "from", "by", "near", "de", "la", "le", "du", "el",
  "visit", "visiting", "explore", "exploring", "tour", "walk", "walking",
  "stroll", "hike", "experience", "guided", "morning", "afternoon", "evening",
  "day", "half", "full", "trip", "free", "time", "around", "local", "see",
]);

/** Significant lowercase tokens of a name/title (diacritics stripped). */
function tokensOf(s: string): Set<string> {
  return new Set(
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Does a block title refer to this attraction? True on full-string
 * containment, or on token overlap: ≥2 shared significant tokens, or every
 * significant token of the shorter side appearing in the longer one (so
 * "Arashiyama Bamboo Grove" matches "Walk through the Arashiyama Bamboo
 * Forest", and "Kinkaku-ji" matches "Kinkaku-ji Golden Pavilion").
 */
function titleMatches(name: string, title: string): boolean {
  const nName = norm(name);
  const nTitle = norm(title);
  if (!nName || !nTitle) return false;
  if (nTitle.includes(nName) || nName.includes(nTitle)) return true;

  const a = tokensOf(name);
  const b = tokensOf(title);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared >= 2) return true;
  return shared >= 1 && (shared === a.size || shared === b.size);
}

/**
 * Infinite scroll: keep only genuinely new incoming suggestions (name-deduped,
 * case-insensitive) and remap any id that collides with the existing list —
 * attraction ids are purely local keys (votes, React keys), so remapping is
 * safe. `makeId` is injected for testability.
 */
export function dedupeNewAttractions(
  existing: Attraction[],
  incoming: Attraction[],
  makeId: () => string,
): Attraction[] {
  const names = new Set(existing.map((a) => norm(a.name)));
  const ids = new Set(existing.map((a) => a.id));
  const fresh: Attraction[] = [];
  for (const a of incoming) {
    const n = norm(a.name);
    if (!n || names.has(n)) continue;
    names.add(n);
    const item = ids.has(a.id) ? { ...a, id: makeId() } : a;
    ids.add(item.id);
    fresh.push(item);
  }
  return fresh;
}

/**
 * Which proposed attractions are actually in the current plan — derived from
 * the itinerary via token-overlap title matching, so the Attractions tab
 * always reflects reality even after chat-only edits. All block types count
 * except arrival/departure: food suggestions legitimately show up as meal
 * blocks ("Lunch crawl at Nishiki Market").
 */
export function attractionIdsInPlan(attractions: Attraction[], plan: TripPlan): Set<string> {
  const titles = plan.days
    .flatMap((d) => d.blocks)
    .filter((b) => b.type !== "arrival" && b.type !== "departure")
    .map((b) => b.title);
  const ids = new Set<string>();
  for (const a of attractions) {
    if (titles.some((t) => titleMatches(a.name, t))) ids.add(a.id);
  }
  return ids;
}
