import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment. Server-side only —
// never import this module from a client component.
export const anthropic = new Anthropic();

export const PLANNER_MODEL = "claude-opus-4-8";
