import { CopyButton } from "@/components/ui/copy-button";
import type { FormState } from "@/server/actions/form-state";

/** One-time display of a temporary password, right after it was generated. */
export function TemporaryPassword({ value }: { value: NonNullable<FormState["temporaryPassword"]> }) {
  return (
    <div role="status" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-amber-950">
      <p className="text-sm">
        Mot de passe temporaire pour <strong>{value.username}</strong> :
      </p>
      <p className="font-mono text-lg font-semibold break-all select-all">{value.password}</p>
      <CopyButton text={value.password} />
      <p className="text-sm">
        Notez-le maintenant : il ne sera plus jamais affiché. Transmettez-le en privé. La personne devra choisir son
        propre mot de passe dès sa connexion.
      </p>
    </div>
  );
}
