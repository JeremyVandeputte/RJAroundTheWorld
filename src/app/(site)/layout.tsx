import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { countUnreadNotifications } from "@/server/services/notifications";
import { getSitePhotoVersion, sitePhotoUrl } from "@/server/services/site-photo";

// Do not add a loading.tsx (or Suspense around pages) in this segment: with
// streaming, the "200 OK" status is sent before a page can call notFound() or
// redirect(). Hidden trips would then answer 200 instead of a clean 404, and
// redirections (login, forced password change) would happen in the browser.
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // No bell while a new password must be chosen: the rest of the site is closed.
  const unread = user && !user.mustChangePassword ? countUnreadNotifications(getDb(), user) : null;
  return (
    <>
      <SiteHeader user={user} unreadNotifications={unread} photoUrl={sitePhotoUrl(getSitePhotoVersion(getDb()), "nav")} />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </>
  );
}
