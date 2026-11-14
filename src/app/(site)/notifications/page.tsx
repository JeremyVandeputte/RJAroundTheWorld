import type { Metadata } from "next";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { SubmitButton } from "@/components/ui/submit-button";
import { describeNotification } from "@/lib/notification-text";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  openNotificationAction,
} from "@/server/actions/notifications";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { listNotifications, NOTIFICATION_LIST_LIMIT } from "@/server/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireUser();
  const notifications = listNotifications(getDb(), viewer);
  const unread = notifications.filter((notification) => !notification.isRead).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {unread > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <SubmitButton variant="secondary" pendingLabel="…">
              Tout marquer comme lu
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <p className="text-muted">Aucune notification pour le moment.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
          {notifications.map((notification) => (
            <li key={notification.id} className={notification.isRead ? "" : "bg-accent/5"}>
              <form action={openNotificationAction}>
                <input type="hidden" name="notificationId" value={notification.id} />
                <button type="submit" className="block w-full px-4 pt-3 pb-2 text-left hover:bg-paper">
                  <span className="flex items-start gap-2">
                    {notification.isRead ? null : (
                      <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />
                    )}
                    <span className={notification.isRead ? "text-muted" : "font-medium"}>
                      {notification.isRead ? null : <span className="sr-only">Non lue : </span>}
                      {describeNotification(notification)}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    <LocalDateTime iso={notification.createdAt.toISOString()} />
                  </span>
                </button>
              </form>
              {notification.isRead ? null : (
                <form action={markNotificationReadAction} className="px-4 pb-2">
                  <input type="hidden" name="notificationId" value={notification.id} />
                  <button type="submit" className="min-h-11 text-sm text-accent">
                    Marquer comme lue
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {notifications.length >= NOTIFICATION_LIST_LIMIT ? (
        <p className="text-sm text-muted">Seules les {NOTIFICATION_LIST_LIMIT} notifications les plus récentes sont affichées.</p>
      ) : null}
    </div>
  );
}
