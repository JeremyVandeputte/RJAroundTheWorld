import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </>
  );
}
