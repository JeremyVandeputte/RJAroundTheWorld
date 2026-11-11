import type { SessionUser } from "@/server/auth/sessions";

const badge = "inline-block rounded-full border px-2 py-0.5 text-xs font-medium";

/** Status labels of an account, as shown in the administration pages. */
export function UserBadges({ user }: { user: SessionUser }) {
  return (
    <span className="flex flex-wrap gap-1">
      {user.role === "superuser" ? (
        <span className={`${badge} border-accent/40 bg-accent/10 text-accent`}>Administrateur</span>
      ) : null}
      {!user.isActive ? <span className={`${badge} border-red-200 bg-red-50 text-red-800`}>Désactivé</span> : null}
      {user.mustChangePassword ? (
        <span className={`${badge} border-amber-200 bg-amber-50 text-amber-900`}>Mot de passe à changer</span>
      ) : null}
    </span>
  );
}

/** Short summary such as "Commenter, Réagir". */
export function permissionSummary(user: SessionUser): string {
  if (user.role === "superuser") return "Toutes les permissions";
  const granted = [
    user.canPublish ? "Publier" : null,
    user.canComment ? "Commenter" : null,
    user.canReact ? "Réagir" : null,
    user.canManageTrips ? "Gérer les voyages" : null,
  ].filter(Boolean);
  return granted.length > 0 ? granted.join(", ") : "Lecture seule";
}
