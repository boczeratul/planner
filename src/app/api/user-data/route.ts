import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/requireUser";
import { loadUserData, saveUserData } from "@/lib/userData";
import type { SyncPayload } from "@/lib/syncTypes";

export const maxDuration = 30;

// GET -> { data: SyncPayload | null } for the signed-in user.
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await loadUserData(userId);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("user-data GET failed:", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

// PUT { data: SyncPayload } -> persist for the signed-in user.
export async function PUT(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as { data?: SyncPayload };
    if (!body?.data || typeof body.data !== "object" || !Array.isArray(body.data.trips)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    await saveUserData(userId, body.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("user-data PUT failed:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
