import { APP_NAME } from "@/lib/app";

// Temporary home page: replaced by the list of trips in a later step.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="mt-2 text-muted">Le journal de voyage est en cours de préparation.</p>
    </main>
  );
}
