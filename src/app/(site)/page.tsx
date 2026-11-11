import { APP_NAME } from "@/lib/app";
import { getViewer } from "@/server/auth/current-user";

// Temporary home page: replaced by the list of trips in a later step.
export default async function HomePage() {
  const viewer = await getViewer();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="mt-2 text-muted">
        {viewer ? `Bonjour ${viewer.displayName}. ` : ""}
        Le journal de voyage est en cours de préparation.
      </p>
    </>
  );
}
