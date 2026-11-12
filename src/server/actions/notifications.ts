"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { markAllNotificationsRead, markNotificationRead } from "@/server/services/notifications";
import { formId } from "./form-state";

// Notifications are marked as read through forms, never by visiting a link:
// browsers prefetch links, which would mark them read without a click.

/** Opens what a notification is about, and marks it as read. */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const notificationId = formId(formData, "notificationId");
  const result = notificationId === null ? null : markNotificationRead(getDb(), await getCurrentUser(), notificationId);
  revalidatePath("/", "layout");
  redirect(result?.ok ? result.href : "/notifications");
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const notificationId = formId(formData, "notificationId");
  if (notificationId !== null) markNotificationRead(getDb(), await getCurrentUser(), notificationId);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  markAllNotificationsRead(getDb(), await getCurrentUser());
  revalidatePath("/", "layout");
}
