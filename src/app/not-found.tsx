import type { Metadata } from "next";

// Deliberately neutral: gives no hint about the site or its name.
export const metadata: Metadata = {
  title: { absolute: "404" },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="mt-2 text-muted">Page introuvable.</p>
    </main>
  );
}
