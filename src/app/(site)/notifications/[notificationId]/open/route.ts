import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { markNotificationRead } from "@/server/services/notifications";

/**
 * Opened by touching a notification on the phone: marks it as read and goes to
 * what it is about. Never linked from a page (links are prefetched, which
 * would mark notifications as read without anyone opening them).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const raw = (await params).notificationId;
  const id = /^\d{1,12}$/.test(raw) ? Number(raw) : null;
  const result = id === null ? null : markNotificationRead(getDb(), user, id);
  revalidatePath("/", "layout");
  redirect(result?.ok ? result.href : "/notifications");
}
