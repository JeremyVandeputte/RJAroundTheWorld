import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TripForm } from "@/components/trips/trip-form";
import { getViewer } from "@/server/auth/current-user";
import { canManageTrips } from "@/server/permissions";

export const metadata: Metadata = { title: "Nouveau voyage" };

export default async function NewTripPage() {
  if (!canManageTrips(await getViewer())) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/" className="text-sm text-accent underline-offset-4 hover:underline">
        ← Voyages
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Nouveau voyage</h1>
      <TripForm />
    </div>
  );
}
