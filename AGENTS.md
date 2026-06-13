# AGENTS.md — AI Tour Planner

## What this app is

A web app that plans trips around a user's travel personality:

1. **Onboarding quiz** — a series of A-vs-B scenario questions ("night market stalls" vs "a booked table") captures travel preferences. Answers persist in **localStorage** (no accounts, no backend storage). The generated plan and chat transcript also persist in localStorage, so a returning user lands back on their itinerary.
2. **Trip chat** — a persistent left-hand chat panel. The first message ("Plan a 4-day trip to Kyoto in November…") generates a full structured itinerary tailored to the stored preferences; follow-up messages **refine** the existing plan (the API receives the current plan + recent transcript and returns a revised plan plus a short conversational reply).
3. **Schedule board** — each interest point (breakfast, lunch, dinner, attractions, activities) is a **drag-and-drop block**, one column per day. When the user rearranges blocks, the app re-asks Claude to sort out logistics for that day: new start times, transit legs (bus/train/walk with concrete line names), and lodging.
4. **Micro-preference learning** — both adjustment paths (chat refinements and drags) ask Claude, in the same structured response, whether the adjustment reveals a durable taste (`learnedPreferences` field). New ones are stored in localStorage alongside quiz answers, fed into every future prompt via `describePreferences(answers, learned)`, and surfaced in the chat as a small "📌 Noted: …" line. The model is prompted to be conservative — an empty list is the normal case.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS 4**, `src/` layout, `@/*` alias
- **zustand** for state; preferences use the `persist` middleware → localStorage key `tour-planner-preferences`
- **@dnd-kit** (`core` / `sortable` / `utilities`) for the schedule board
- **@anthropic-ai/sdk** + **zod** for LLM calls with structured outputs

## Commands

```sh
npm run dev     # dev server at localhost:3000
npm run build   # production build (also the type-check gate)
npm run lint    # eslint
```

Requires `ANTHROPIC_API_KEY` in `.env.local` (see `.env.example`). The UI works without it up to the point of calling `/api/plan`, which will 500.

## Architecture map

| Path | Role |
| --- | --- |
| `src/lib/types.ts` | **Single source of truth** for the data model. Zod schemas (`TripPlanSchema`, `LogisticsUpdateSchema`, …) double as Claude's structured-output contracts AND the TS types. Change shape here first; everything else follows. |
| `src/lib/preferences.ts` | The A/B question bank + `describePreferences()` which renders answers into plain language for prompts. Add new quiz questions here only. |
| `src/lib/anthropic.ts` | Anthropic client + `PLANNER_MODEL` constant. Server-only — never import from a client component. |
| `src/app/api/plan/route.ts` | POST `{request, preferences, learned, currentPlan?, history?}` → **streamed** `text/plain` body: the structured-output JSON document piped delta-by-delta. Two modes: initial (`PlanResponseSchema` — full plan) vs refine (`currentPlan` set → `PlanRefineResponseSchema` — **only `changedDays`**, merged client-side; emitting unchanged days would waste output tokens, which dominate latency). Runs at `effort: "medium"`. Pre-stream failures return JSON `{error}`; mid-stream failures abort the body (client's final parse fails). |
| `src/app/api/export/route.ts` | POST `{plan}` → creates a Notion page (raw REST, `Notion-Version: 2022-06-28`) under `NOTION_PARENT_PAGE_ID`: summary → toggleable heading per day with time-prefixed bullets + gray transit lines → lodging table with Google Maps links. Returns `{url}`. **The Notion API cannot toggle "Publish to web"** — sharability comes from publishing the parent page once (exports under it inherit public access). Needs `NOTION_API_KEY` (501 with a setup hint when unset). |
| `src/lib/stays.ts` | Shared lodging logic: `collectStays()` (per-day lodging → consecutive-night stays, skipping nulls + `NOT_A_HOTEL` legacy entries), `nightsLabel()`, `googleMapsUrl()`. Used by `HotelList` and the export route — change here, not in components. |
| `src/lib/streaming.ts` | Client-side progressive parsing + refinement merging: `repairAndParse()` (close open strings/brackets on a JSON fragment), `parsePartialPlanResponse()` / `parsePartialRefineResponse()` (extract only the pieces that already zod-validate), `overlayPartialDays()` (live view of a refinement over the existing plan), `mergeRefinedPlan()` (final merge: replace changed days, append new ones, drop days beyond `durationDays`). |
| `src/app/api/logistics/route.ts` | POST `{destination, day, blocks, previousBlockIds, preferences, learned}` → `LogisticsUpdate` (recomputed start times + transit legs + lodging + any `learnedPreferences`) for one reordered day. |
| `src/store/preferences.ts` | Persisted zustand store (answers, `microPreferences`, onboarding flag, hydration flag). `addMicroPreferences()` dedupes case-insensitively, caps at 30, and returns only the genuinely new texts (callers use that to emit 📌 chat notes). `resetOnboarding()` clears micro-preferences too. |
| `src/store/trip.ts` | Trip store: plan, chat transcript, optimistic reorder, per-day recompute status. Plan + transcript persist to localStorage key `tour-planner-trip` (transient flags are partialized out), so a returning user sees their last plan. `reset()` clears plan + chat together. |
| `src/components/Onboarding.tsx` | Quiz flow. |
| `src/components/ChatPanel.tsx` | Persistent left sidebar: chat transcript + input. Sends `{request, preferences, currentPlan, history}` to `/api/plan`; renders the `reply` as an assistant bubble. |
| `src/components/ScheduleBoard.tsx` | dnd-kit board (center pane). `DayColumn.handleDragEnd` is the reorder → `/api/logistics` → apply loop. |
| `src/components/HotelList.tsx` | Right column (hidden below `lg`): renders the stays from `src/lib/stays.ts`; each card opens a Google Maps search in a new tab. |
| `src/app/page.tsx` | Planning page: hydrating → onboarding → three-column layout (ChatPanel left, board center, HotelList right when a plan exists). Board header links to `/execute`. |
| `src/app/execute/page.tsx` | Execution page: one day at a time — day tabs + prev/next, the day's blocks/transit/lodging as clickable cards in a left column (reuses `BlockInner`/`TransitLeg` from `ScheduleBoard`), and a Google Map (`DayMap`) as the main region. **Pins only, no routing.** `dayStops()` emits place-name *queries* (previous night's lodging → blocks → tonight's lodging); the plan schema carries **no coordinates**. Clicking a card pans/zooms to its pin; clicking a pin highlights the card. Needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with Maps JavaScript API **and Geocoding API** enabled (referrer-restricted; public by design). Links back to `/`. |
| `src/components/HotelReconciler.tsx` | Invisible client component on the planning page: after each plan change (skipped while streaming), geocodes every unique hotel and (a) posts a ⚠️ note for hotels Google can't find, (b) **merges lodging entries resolving to the same `place_id`** via `mergeLodgings()` (differently-worded names for one hotel), (c) posts a ✅ note when all verify. place_ids cached in localStorage `tour-planner-hotel-pids`; the last verified hotel-set signature persists in `tour-planner-hotels-verified` so reloads don't re-post notes. Renders nothing; no-op without the Maps key. |
| `src/components/DayMap.tsx` | `@vis.gl/react-google-maps` wrapper (dynamic-imported, `ssr:false`). `useGeocodedStops()` resolves each query with `google.maps.Geocoder` on the fly — cache-first via localStorage key `tour-planner-geocache` (capped at 300 entries; one billed geocode per unique place, ever) — pins appear progressively with a "Locating places…" overlay; unresolvable names simply get no pin. `CameraController` fits bounds per day and pans to the selected stop. |

## Conventions and invariants

- **Block/leg contract:** within a day, `legs[i]` connects `blocks[i].id → blocks[i+1].id`. The UI only renders a leg if it matches the current consecutive pair — so after a drag, stale legs vanish automatically until the recompute returns. Preserve this invariant in any schema or prompt change.
- **Block ids** are model-generated, format `d{day}-b{index}`, unique across the whole trip. Never regenerate ids client-side; legs reference them.
- **Reorders are optimistic:** `reorderDay()` updates order immediately, times show `--:--` while `recomputingDays` contains that day, then `applyLogistics()` lands new times/legs/lodging.
- **Streaming render:** while `/api/plan` streams, the trip store's `streaming`/`streamingPlan` drive a **read-only** board (`StreamingDayColumn` — no `DndContext`, so dragging is impossible until done) and a live-typing reply bubble in the chat. The client re-runs `parsePartialPlanResponse()` per chunk and zod-validates the complete document at the end (`PlanResponseSchema.parse`). Streaming state is transient — never persisted, always cleared in the `finally`. The hotel column hides while streaming.
- **Refinement contract:** `/api/plan` with `currentPlan` must preserve ids of blocks the user didn't ask to change (the system prompt enforces this) so the board diff feels stable. Chat history is capped to the last 12 messages client-side state, sent as plain transcript text — not as multi-turn API messages. `role: "note"` messages (📌 learned-preference lines) are UI-only and **must be filtered out** of the history payload.
- **Arrival/departure blocks:** the block-type enum includes `"arrival"` and `"departure"`; the plan prompt requires day 1 to start with an arrival block and the last day to end with a departure block naming the real entry/exit point ("Arrive at OKA airport"). They're ordinary blocks, so the execute page pins them automatically. When adding a block type, update `TYPE_STYLES` (ScheduleBoard) and `TYPE_EMOJI` (export route) — both are exhaustive `Record`s, TS will flag omissions.
- **Locked blocks:** `isLocked()` (ScheduleBoard) = arrival/departure types or `movable === false` (a model-set flag for lodging-anchored blocks like "breakfast near the hotel" and timed bookings; legacy blocks without the flag stay draggable). Locked blocks get `useSortable({disabled})`, a 📌 badge, and no grab cursor; `handleDragEnd` additionally snaps arrival to the front and departure to the end even when *other* blocks are dropped past them.
- **Swap-out flow:** unlocked blocks show a hover "⇄ swap" button (`SortableBlock`) that sets `chatDraft` in the trip store with a prefilled request naming the block + day; ChatPanel watches `chatDraft`, copies it into the input, focuses with the cursor at the end, and clears the draft. The user finishes the sentence and sends — it's an ordinary refinement, no special API path. The button stops pointer propagation so it never starts a drag. `chatDraft` is transient (not persisted).
- **Streaming placeholder:** the "✍️ planning…" card follows `PartialTripPlan.activeDay` (set by ChatPanel: last day of the partial parse for initial plans, last changed day for refinements) — not the last column. Keep setting `activeDay` when touching the streaming path, or mid-trip refinements show the placeholder on the wrong day.
- **Lodging is nullable:** `DayPlan.lodging` (and `LogisticsUpdate.lodging`) is `Lodging | null` — null on days with no overnight stay (typically the final day). Prompts forbid "checkout"-placeholder lodging entries; `HotelList.collectStays()` additionally skips nulls and `NOT_A_HOTEL`-matching names (legacy persisted plans). Guard any new lodging rendering with a null check.
- **Start date:** `TripPlan.startDate` is ISO `YYYY-MM-DD` or `""` when unknown. The model extracts it from the request (relative dates resolved against a "Today's date" line injected into the prompt) and is told to ask in its reply when missing; the board additionally shows an amber date-picker banner (`setStartDate()` in the trip store). Day columns render `dateForDay(startDate, day)` from `src/lib/dates.ts` (local-time parsing — don't switch to `new Date("YYYY-MM-DD")`, it's UTC and shifts a day in some timezones). Refinements must never blank an existing date (`mergeRefinedPlan` falls back to the old value). Persisted plans from before this field may lack it — treat `undefined` like `""`.
- **Micro-preference flow:** client sends `learned: string[]` (texts only) with every plan/logistics call; routes pass it into `describePreferences()`; responses carry `learnedPreferences: string[]`; client stores them via `addMicroPreferences()`. The drag path needs `previousBlockIds` so the model can compare orders — keep sending it.
- Cross-day block moves are **not supported yet** (each day is its own `DndContext`). If adding, the logistics route needs both affected days.
- LLM prompts live next to their route handlers as `SYSTEM_PROMPT` constants — keep them there, not in shared modules.

## Claude API usage rules

- Models: `PLANNER_MODEL` and `LOGISTICS_MODEL` are both `claude-haiku-4-5` (fastest/cheapest; chosen for latency). Haiku 4.5 supports **neither** adaptive thinking nor `effort` — adding either 400s. If itinerary quality needs a bump, set `PLANNER_MODEL` to `claude-sonnet-4-6` and restore `thinking: {type:"adaptive"}` + `output_config.effort` in the plan route. Change models in `anthropic.ts` only. Never guess model ids — there is no "sonnet 4.7"; unknown ids 404.
- Always stream: `anthropic.messages.stream()` + `await stream.finalMessage()`, with `output_config: { format: zodOutputFormat(Schema) }` for structured output. The SDK **rejects** non-streaming requests with high `max_tokens` ("Streaming is required for operations that may take longer than 10 minutes") — do not switch back to `messages.create()`/`messages.parse()` for these routes.
- The output format guarantees the text block is schema-valid JSON; extract it and validate with `Schema.parse(JSON.parse(text))` — never regex/hand-parse model text.
- Always `thinking: { type: "adaptive" }`. Do **not** add `temperature`, `top_p`, `top_k`, or `budget_tokens` (deprecated/removed on current models, and they 400 on Opus 4.7+). No assistant-message prefills (400 on Sonnet 4.6 and Opus 4.6+).
- Structured-output schemas can't use zod refinements like `min()`/`max()`/recursion — keep `types.ts` schemas to plain types, enums, and `.describe()`.

## Gotchas

- **npm cache:** this machine's `~/.npm` has root-owned files; if `npm install` fails with EACCES, use `npm install --cache /tmp/npm-cache-planner` (or fix once with `sudo chown -R 501:20 ~/.npm`).
- **Hydration:** `page.tsx` returns `null` until the persisted store hydrates (`hasHydrated`). Don't read `usePreferences` values during SSR-visible render paths without that guard.
- `next.config.ts` is default; API route timeouts are set per-route via `export const maxDuration`.

## Roadmap (not yet built)

- Cross-day drag, block delete/add ("suggest a replacement"), date-aware planning (weather/seasonal), share/export itinerary, streaming plan generation for faster perceived latency.
