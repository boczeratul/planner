import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment. Server-side only —
// never import this module from a client component.
export const anthropic = new Anthropic();

// Sonnet keeps API cost low ($3/$15 per Mtok vs $5/$25 for Opus).
// NOTE: there is no "claude-sonnet-4-7" — 4.6 is the latest Sonnet; a guessed id 404s.
export const PLANNER_MODEL = "claude-sonnet-4-6";

// Drag-recompute is a small mechanical task — Haiku is much faster, which
// keeps drags snappy. NOTE: Haiku 4.5 supports neither adaptive thinking nor
// the effort parameter; don't add either to its requests.
export const LOGISTICS_MODEL = "claude-haiku-4-5";
