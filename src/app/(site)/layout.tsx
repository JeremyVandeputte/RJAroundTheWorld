import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { countUnreadNotifications } from "@/server/services/notifications";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // No bell while a new password must be chosen: the rest of the site is closed.
  const unread = user && !user.mustChangePassword ? countUnreadNotifications(getDb(), user) : null;
  return (
    <>
      <SiteHeader user={user} unreadNotifications={unread} />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </>
  );
}
