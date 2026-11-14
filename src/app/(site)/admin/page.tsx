import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { permissionSummary, UserBadges } from "@/components/admin/user-badges";
import { SitePhotoAdmin } from "@/components/admin/site-photo-admin";
import { TagAdmin } from "@/components/admin/tag-admin";
import { APP_NAME } from "@/lib/app";
import { CopyButton } from "@/components/ui/copy-button";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { getEnv } from "@/lib/env";
import { getViewer } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { canAccessAdmin, canManageJournal } from "@/server/permissions";
import { getSitePhotoVersion, sitePhotoUrl } from "@/server/services/site-photo";
import { listUsers } from "@/server/services/admin";
import { listTagsWithUsage } from "@/server/services/tags";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage() {
  const viewer = await getViewer();
  // Same answer as an unknown page: the administration is not advertised.
  if (!canAccessAdmin(viewer)) notFound();
  // Accounts and the secret link: the superuser only.
  const accounts = listUsers(getDb(), viewer);
  const tags = listTagsWithUsage(getDb(), viewer);

  const env = getEnv();
  const secretLink = `${env.appOrigin}/access/${env.accessToken}`;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>

      {accounts.ok ? (
        <>
          <section aria-labelledby="accounts-title">
            <h2 id="accounts-title" className="text-lg font-semibold">
              Comptes
            </h2>
            <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-white">
              {accounts.users.map((user) => (
                <li key={user.id}>
                  <Link href={`/admin/users/${user.id}`} className="block px-4 py-3 hover:bg-paper">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{user.displayName}</span>
                      <span className="text-sm text-muted">{user.username}</span>
                      <UserBadges user={user} />
                    </span>
                    <span className="mt-1 block text-sm text-muted">{permissionSummary(user)}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {user.lastSeenAt ? (
                        <>
                          Dernière visite : <LocalDateTime iso={user.lastSeenAt.toISOString()} />
                        </>
                      ) : (
                        "Jamais venu sur le site"
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="create-title" className="max-w-sm">
            <h2 id="create-title" className="text-lg font-semibold">
              Créer un compte
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              Un mot de passe temporaire est généré et affiché une seule fois, juste après la création.
            </p>
            <CreateUserForm />
          </section>
        </>
      ) : null}

      {canManageJournal(viewer) ? (
        <section aria-labelledby="photo-title" className="max-w-xl">
          <h2 id="photo-title" className="text-lg font-semibold">
            Photo du site
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Affichée dans un rond à gauche de « {APP_NAME} » en haut de chaque page, et comme icône de l&apos;onglet du
            navigateur. Elle est recadrée en carré, au centre. JPEG, PNG ou WebP, 8 Mo au maximum.
          </p>
          <SitePhotoAdmin photoUrl={sitePhotoUrl(getSitePhotoVersion(getDb()), "nav")} />
        </section>
      ) : null}

      {tags ? (
        <section aria-labelledby="tags-title" className="max-w-xl">
          <h2 id="tags-title" className="text-lg font-semibold">
            Tags
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Les personnes qui ont la permission Publier peuvent aussi créer des tags en écrivant une entrée.
          </p>
          <TagAdmin tags={tags} />
        </section>
      ) : null}

      {accounts.ok ? (
        <section aria-labelledby="link-title">
          <h2 id="link-title" className="text-lg font-semibold">
            Lien secret
          </h2>
          <p className="mt-1 text-sm text-muted">
            À envoyer en privé aux personnes qui peuvent consulter le site. Il doit être ouvert une fois sur chaque
            appareil.
          </p>
          <p className="mt-3 rounded-md border border-line bg-white px-3 py-2 font-mono text-sm break-all select-all">
            {secretLink}
          </p>
          <div className="mt-3">
            <CopyButton text={secretLink} label="Copier le lien" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
