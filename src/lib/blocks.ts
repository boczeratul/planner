import type { ScheduleBlock } from "./types";

/**
 * Blocks that must keep their place and cannot be dragged: arrival/departure,
 * and anything the planner marked as anchored (`movable === false`, e.g.
 * "breakfast near the hotel" or a fixed-time booking). Legacy blocks saved
 * before the `movable` flag existed stay draggable.
 */
export function isLocked(block: ScheduleBlock): boolean {
  return block.type === "arrival" || block.type === "departure" || block.movable === false;
}
