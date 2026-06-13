import { auth } from "@clerk/nextjs/server";

/** The Clerk user id for the current request, or null when signed out. */
export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}
