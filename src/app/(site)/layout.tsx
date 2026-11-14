import Link from "next/link";
import type { ReactNode } from "react";
import { InfoIcon } from "@/components/ui/icons";
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
      {unread !== null ? (
        <footer className="mx-auto max-w-3xl border-t border-line px-4 pt-4 pb-8 text-sm">
          <Link href="/about" className="inline-flex min-h-11 items-center gap-1.5 text-accent underline-offset-4 hover:underline">
            <InfoIcon className="size-4" />À propos
          </Link>
        </footer>
      ) : null}
    </>
  );
}
