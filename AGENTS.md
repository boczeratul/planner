# AGENTS.md — AI Tour Planner

## What this app is

A web app that plans trips around a user's travel personality:

1. **Onboarding quiz** — a series of A-vs-B scenario questions ("night market stalls" vs "a booked table") captures travel preferences. Answers persist in **localStorage** (no accounts, no backend storage).
2. **Trip request** — the main input is a free-text box ("Plan a 4-day trip to Kyoto in November…"). The server asks Claude to generate a full structured itinerary tailored to the stored preferences.
3. **Schedule board** — each interest point (breakfast, lunch, dinner, attractions, activities) is a **drag-and-drop block**, one column per day. When the user rearranges blocks, the app re-asks Claude to sort out logistics for that day: new start times, transit legs (bus/train/walk with concrete line names), and lodging.

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
| `src/app/api/plan/route.ts` | POST `{request, preferences}` → full `TripPlan`. One Claude call. |
| `src/app/api/logistics/route.ts` | POST `{destination, day, blocks, preferences}` → `LogisticsUpdate` (recomputed start times + transit legs + lodging) for one reordered day. |
| `src/store/preferences.ts` | Persisted zustand store (answers, onboarding flag, hydration flag). |
| `src/store/trip.ts` | In-memory trip store: plan, optimistic reorder, per-day recompute status. |
| `src/components/Onboarding.tsx` | Quiz flow. |
| `src/components/TripInput.tsx` | Free-text trip request → `/api/plan`. |
| `src/components/ScheduleBoard.tsx` | dnd-kit board. `DayColumn.handleDragEnd` is the reorder → `/api/logistics` → apply loop. |
| `src/app/page.tsx` | Router-less state machine: hydrating → onboarding → input → board. |

## Conventions and invariants

- **Block/leg contract:** within a day, `legs[i]` connects `blocks[i].id → blocks[i+1].id`. The UI only renders a leg if it matches the current consecutive pair — so after a drag, stale legs vanish automatically until the recompute returns. Preserve this invariant in any schema or prompt change.
- **Block ids** are model-generated, format `d{day}-b{index}`, unique across the whole trip. Never regenerate ids client-side; legs reference them.
- **Reorders are optimistic:** `reorderDay()` updates order immediately, times show `--:--` while `recomputingDays` contains that day, then `applyLogistics()` lands new times/legs/lodging.
- Cross-day block moves are **not supported yet** (each day is its own `DndContext`). If adding, the logistics route needs both affected days.
- LLM prompts live next to their route handlers as `SYSTEM_PROMPT` constants — keep them there, not in shared modules.

## Claude API usage rules

- Model: `claude-opus-4-8` (via `PLANNER_MODEL` — change there only).
- Always `anthropic.messages.parse()` with `output_config: { format: zodOutputFormat(Schema) }` for structured output; read `response.parsed_output`. Never hand-parse JSON out of text blocks.
- Always `thinking: { type: "adaptive" }`. Do **not** add `temperature`, `top_p`, `top_k`, or `budget_tokens` — these 400 on this model. No assistant-message prefills.
- Structured-output schemas can't use zod refinements like `min()`/`max()`/recursion — keep `types.ts` schemas to plain types, enums, and `.describe()`.
- If a response could exceed ~16K output tokens, use streaming (`messages.stream()` + `finalMessage()`).

## Gotchas

- **npm cache:** this machine's `~/.npm` has root-owned files; if `npm install` fails with EACCES, use `npm install --cache /tmp/npm-cache-planner` (or fix once with `sudo chown -R 501:20 ~/.npm`).
- **Hydration:** `page.tsx` returns `null` until the persisted store hydrates (`hasHydrated`). Don't read `usePreferences` values during SSR-visible render paths without that guard.
- `next.config.ts` is default; API route timeouts are set per-route via `export const maxDuration`.

## Roadmap (not yet built)

- Cross-day drag, block delete/add ("suggest a replacement"), date-aware planning (weather/seasonal), share/export itinerary, streaming plan generation for faster perceived latency.
