import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { logoutAction } from "@/server/actions/auth";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Mon profil" };

export default async function ProfilePage() {
  // This is the only page reachable while a password change is required.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-sm space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Mon profil</h1>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Nom affiché</dt>
            <dd className="font-medium">{user.displayName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Identifiant</dt>
            <dd className="font-medium">{user.username}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Changer mon mot de passe</h2>
        {user.mustChangePassword ? (
          <p role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Vous devez choisir un nouveau mot de passe avant d&apos;accéder au reste du site.
          </p>
        ) : null}
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </section>

      <section className="border-t border-line pt-6">
        <form action={logoutAction}>
          <SubmitButton variant="secondary">Se déconnecter</SubmitButton>
        </form>
      </section>
    </div>
  );
}
