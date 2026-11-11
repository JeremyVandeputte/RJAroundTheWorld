import Link from "next/link";
import { APP_NAME } from "@/lib/app";
import type { SessionUser } from "@/server/auth/sessions";
import { canManageUsers } from "@/server/permissions";

const navLink = "text-accent underline-offset-4 hover:underline";

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          {APP_NAME}
        </Link>
        <nav aria-label="Compte" className="flex items-center gap-4 text-sm">
          {canManageUsers(user) ? (
            <Link href="/admin" className={navLink}>
              Administration
            </Link>
          ) : null}
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
