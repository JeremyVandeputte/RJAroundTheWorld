import Link from "next/link";
import { APP_NAME } from "@/lib/app";
import type { SessionUser } from "@/server/auth/sessions";

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          {APP_NAME}
        </Link>
        <nav aria-label="Compte" className="text-sm">
          {user ? (
            <Link href="/profile" className="text-accent underline-offset-4 hover:underline">
              {user.displayName}
            </Link>
          ) : (
            <Link href="/login" className="text-accent underline-offset-4 hover:underline">
              Se connecter
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
