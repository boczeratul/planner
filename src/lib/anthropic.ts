import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment. Server-side only —
// never import this module from a client component.
export const anthropic = new Anthropic();

// Haiku everywhere: fastest + cheapest ($1/$5 per Mtok). Bump PLANNER_MODEL
// back to claude-sonnet-4-6 (and restore thinking/effort params in the plan
// route) if itinerary quality needs it.
// NOTE: Haiku 4.5 supports neither adaptive thinking nor the effort
// parameter — requests carrying either return a 400.
export const PLANNER_MODEL = "claude-haiku-4-5";
export const LOGISTICS_MODEL = "claude-haiku-4-5";
