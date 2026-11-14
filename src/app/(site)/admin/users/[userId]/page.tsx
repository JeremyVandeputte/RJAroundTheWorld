import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PermissionsForm } from "@/components/admin/permissions-form";
import { UserActionForm } from "@/components/admin/user-action-form";
import { UserBadges } from "@/components/admin/user-badges";
import {
  deleteUserAction,
  forcePasswordChangeAction,
  resetPasswordAction,
  setActiveAction,
} from "@/server/actions/admin";
import { getViewer } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { getUser } from "@/server/services/admin";

export const metadata: Metadata = { title: "Compte" };

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const id = /^[1-9]\d{0,14}$/.test(userId) ? Number(userId) : null;
  const result = id === null ? null : getUser(getDb(), await getViewer(), id);
  if (!result?.ok) notFound();
  const user = result.user;

  return (
    <div className="mx-auto max-w-sm space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-accent underline-offset-4 hover:underline">
          ← Administration
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{user.displayName}</h1>
        <p className="text-muted">{user.username}</p>
        <div className="mt-2">
          <UserBadges user={user} />
        </div>
      </div>

      {user.role === "superuser" ? (
        <p className="text-sm text-muted">
          Ce compte est celui de l&apos;administrateur : il a toutes les permissions et ne peut être ni désactivé ni
          supprimé. Son mot de passe se change depuis « Mon profil ».
        </p>
      ) : (
        <>
          <section aria-labelledby="permissions-title">
            <h2 id="permissions-title" className="text-lg font-semibold">
              Permissions
            </h2>
            <div className="mt-2">
              <PermissionsForm
                userId={user.id}
                canPublish={user.canPublish}
                canManageTrips={user.canManageTrips}
              />
            </div>
          </section>

          <section aria-labelledby="password-title" className="space-y-4">
            <h2 id="password-title" className="text-lg font-semibold">
              Mot de passe
            </h2>
            <div>
              <p className="mb-2 text-sm text-muted">
                Mot de passe oublié : génère un mot de passe temporaire, affiché une seule fois. Les sessions du compte
                sont fermées.
              </p>
              <UserActionForm
                action={resetPasswordAction}
                userId={user.id}
                label="Réinitialiser le mot de passe"
                pendingLabel="Réinitialisation…"
              />
            </div>
            {!user.mustChangePassword ? (
              <div>
                <p className="mb-2 text-sm text-muted">
                  Sans changer le mot de passe actuel : oblige la personne à en choisir un nouveau avant de continuer.
                </p>
                <UserActionForm
                  action={forcePasswordChangeAction}
                  userId={user.id}
                  label="Forcer le changement de mot de passe"
                />
              </div>
            ) : null}
          </section>

          <section aria-labelledby="status-title">
            <h2 id="status-title" className="text-lg font-semibold">
              État du compte
            </h2>
            <p className="mt-1 mb-2 text-sm text-muted">
              {user.isActive
                ? "Un compte désactivé ne peut plus se connecter. Son contenu est conservé."
                : "Ce compte est désactivé : il ne peut plus se connecter."}
            </p>
            <UserActionForm
              action={setActiveAction}
              userId={user.id}
              fields={{ isActive: user.isActive ? "false" : "true" }}
              label={user.isActive ? "Désactiver le compte" : "Réactiver le compte"}
            />
          </section>

          <section aria-labelledby="delete-title" className="border-t border-line pt-6">
            <h2 id="delete-title" className="text-lg font-semibold">
              Supprimer le compte
            </h2>
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2 text-red-800">Supprimer définitivement…</summary>
              <p className="mt-2 mb-3 text-sm text-muted">
                Le compte sera supprimé. Cette action est irréversible. Un compte
                qui a écrit des entrées ne peut pas être supprimé : désactivez-le.
              </p>
              <UserActionForm
                action={deleteUserAction}
                userId={user.id}
                label="Confirmer la suppression"
                pendingLabel="Suppression…"
                variant="danger"
              />
            </details>
          </section>
        </>
      )}
    </div>
  );
}
