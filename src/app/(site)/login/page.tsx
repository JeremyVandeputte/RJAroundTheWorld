import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { APP_NAME } from "@/lib/app";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/profile" : "/");
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
      <p className="mt-2 mb-6 text-muted">
        Connectez-vous à {APP_NAME} avec l&apos;identifiant et le mot de passe qui vous ont été transmis.
      </p>
      <LoginForm />
      <p className="mt-6 text-sm text-muted">
        Mot de passe oublié ? Demandez à l&apos;administrateur du site de vous en définir un nouveau.
      </p>
    </div>
  );
}
