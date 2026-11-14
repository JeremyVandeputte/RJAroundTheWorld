import Link from "next/link";
import { APP_NAME } from "@/lib/app";
import type { SessionUser } from "@/server/auth/sessions";
import { canAccessAdmin } from "@/server/permissions";

const navLink = "text-accent underline-offset-4 hover:underline";

function NotificationBell({ unread }: { unread: number }) {
  const label = unread > 0 ? `Notifications : ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications";
  return (
    <Link href="/notifications" aria-label={label} title={label} className="relative inline-flex size-11 items-center justify-center text-ink">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 ? (
        <span className="absolute top-1 right-0.5 min-w-5 rounded-full bg-red-700 px-1 text-center text-xs leading-5 font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

type SiteHeaderProps = {
  user: SessionUser | null;
  /** Null when the bell must not be shown (anonymous visitor). */
  unreadNotifications: number | null;
  /** Site photo chosen in the administration, shown left of the name. */
  photoUrl: string | null;
};

export function SiteHeader({ user, unreadNotifications, photoUrl }: SiteHeaderProps) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5">
        <Link href="/" className="flex items-center gap-2.5 py-1.5 font-semibold tracking-tight">
          {photoUrl ? (
            <img src={photoUrl} alt="" width={32} height={32} className="size-8 shrink-0 rounded-full object-cover ring-1 ring-line" />
          ) : null}
          {APP_NAME}
        </Link>
        <nav aria-label="Compte" className="flex items-center gap-3 text-sm">
          {canAccessAdmin(user) ? (
            <Link href="/admin" className={navLink}>
              Administration
            </Link>
          ) : null}
          {/* Logged-in accounts only, like the page itself (same condition as the bell). */}
          {unreadNotifications !== null ? (
            <Link href="/about" className={navLink}>
              À propos
            </Link>
          ) : null}
          {unreadNotifications !== null ? <NotificationBell unread={unreadNotifications} /> : null}
          {user ? (
            <Link href="/profile" className={navLink}>
              {user.displayName}
            </Link>
          ) : (
            <Link href="/login" className={navLink}>
              Se connecter
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
