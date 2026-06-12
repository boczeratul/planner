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
| `src/lib/streaming.ts` | Client-side progressive parsing + refinement merging: `repairAndParse()` (close open strings/brackets on a JSON fragment), `parsePartialPlanResponse()` / `parsePartialRefineResponse()` (extract only the pieces that already zod-validate), `overlayPartialDays()` (live view of a refinement over the existing plan), `mergeRefinedPlan()` (final merge: replace changed days, append new ones, drop days beyond `durationDays`). |
| `src/app/api/logistics/route.ts` | POST `{destination, day, blocks, previousBlockIds, preferences, learned}` → `LogisticsUpdate` (recomputed start times + transit legs + lodging + any `learnedPreferences`) for one reordered day. |
| `src/store/preferences.ts` | Persisted zustand store (answers, `microPreferences`, onboarding flag, hydration flag). `addMicroPreferences()` dedupes case-insensitively, caps at 30, and returns only the genuinely new texts (callers use that to emit 📌 chat notes). `resetOnboarding()` clears micro-preferences too. |
| `src/store/trip.ts` | Trip store: plan, chat transcript, optimistic reorder, per-day recompute status. Plan + transcript persist to localStorage key `tour-planner-trip` (transient flags are partialized out), so a returning user sees their last plan. `reset()` clears plan + chat together. |
| `src/components/Onboarding.tsx` | Quiz flow. |
| `src/components/ChatPanel.tsx` | Persistent left sidebar: chat transcript + input. Sends `{request, preferences, currentPlan, history}` to `/api/plan`; renders the `reply` as an assistant bubble. |
| `src/components/ScheduleBoard.tsx` | dnd-kit board (center pane). `DayColumn.handleDragEnd` is the reorder → `/api/logistics` → apply loop. |
| `src/components/HotelList.tsx` | Right column (hidden below `lg`): collapses per-day `lodging` into consecutive-night stays; each card opens an Agoda text-search (`agodaSearchUrl()` — hotel name + area + destination) in a new tab. No Agoda API/affiliate ids involved; if the URL format changes, fix that one helper. |
| `src/app/page.tsx` | Router-less state machine: hydrating → onboarding → three-column layout (ChatPanel left, board center, HotelList right when a plan exists). |

## Conventions and invariants

- **Block/leg contract:** within a day, `legs[i]` connects `blocks[i].id → blocks[i+1].id`. The UI only renders a leg if it matches the current consecutive pair — so after a drag, stale legs vanish automatically until the recompute returns. Preserve this invariant in any schema or prompt change.
- **Block ids** are model-generated, format `d{day}-b{index}`, unique across the whole trip. Never regenerate ids client-side; legs reference them.
- **Reorders are optimistic:** `reorderDay()` updates order immediately, times show `--:--` while `recomputingDays` contains that day, then `applyLogistics()` lands new times/legs/lodging.
- **Streaming render:** while `/api/plan` streams, the trip store's `streaming`/`streamingPlan` drive a **read-only** board (`StreamingDayColumn` — no `DndContext`, so dragging is impossible until done) and a live-typing reply bubble in the chat. The client re-runs `parsePartialPlanResponse()` per chunk and zod-validates the complete document at the end (`PlanResponseSchema.parse`). Streaming state is transient — never persisted, always cleared in the `finally`. The hotel column hides while streaming.
- **Refinement contract:** `/api/plan` with `currentPlan` must preserve ids of blocks the user didn't ask to change (the system prompt enforces this) so the board diff feels stable. Chat history is capped to the last 12 messages client-side state, sent as plain transcript text — not as multi-turn API messages. `role: "note"` messages (📌 learned-preference lines) are UI-only and **must be filtered out** of the history payload.
- **Micro-preference flow:** client sends `learned: string[]` (texts only) with every plan/logistics call; routes pass it into `describePreferences()`; responses carry `learnedPreferences: string[]`; client stores them via `addMicroPreferences()`. The drag path needs `previousBlockIds` so the model can compare orders — keep sending it.
- Cross-day block moves are **not supported yet** (each day is its own `DndContext`). If adding, the logistics route needs both affected days.
- LLM prompts live next to their route handlers as `SYSTEM_PROMPT` constants — keep them there, not in shared modules.

## Claude API usage rules

- Models: `PLANNER_MODEL` = `claude-sonnet-4-6` (plan generation/refinement, `effort: "medium"` for latency) and `LOGISTICS_MODEL` = `claude-haiku-4-5` (drag recompute — fast; supports **neither** adaptive thinking nor `effort`, don't add them). Change models in `anthropic.ts` only. Never guess model ids — there is no "sonnet 4.7"; unknown ids 404.
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
