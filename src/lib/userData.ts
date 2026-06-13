import { Redis } from "@upstash/redis";
import type { SyncPayload } from "@/lib/syncTypes";

// Lazy so `next build` doesn't construct (and require env for) the client when
// it imports this route module for metadata collection.
let client: Redis | null = null;
function redis(): Redis {
  return (client ??= Redis.fromEnv()); // UPSTASH_REDIS_REST_URL / _TOKEN
}

const key = (userId: string) => `tour-planner:user:${userId}`;

export async function loadUserData(userId: string): Promise<SyncPayload | null> {
  return (await redis().get<SyncPayload>(key(userId))) ?? null;
}

export async function saveUserData(userId: string, data: SyncPayload): Promise<void> {
  await redis().set(key(userId), data);
}
