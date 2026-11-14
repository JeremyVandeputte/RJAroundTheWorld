import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/app";
import { getViewer } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { getSitePhotoVersion, sitePhotoUrl } from "@/server/services/site-photo";

export const metadata: Metadata = { title: "À propos" };

export default async function AboutPage() {
  // Like every page, only for logged-in accounts.
  await getViewer();
  const photo = sitePhotoUrl(getSitePhotoVersion(getDb()), "large");

  return (
    <article className="mx-auto max-w-xl space-y-8">
      <Link href="/" className="text-sm text-accent underline-offset-4 hover:underline">
        ← Accueil
      </Link>

      <header className="text-center">
        {photo ? (
          <img
            src={photo}
            alt=""
            width={192}
            height={192}
            className="mx-auto size-48 rounded-full object-cover shadow-sm ring-4 ring-white"
          />
        ) : null}
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">À propos</h1>
        <p className="mt-2 text-lg text-muted">{APP_NAME}, notre carnet de voyages.</p>
      </header>

      <section aria-labelledby="what-title" className="space-y-3 leading-relaxed">
        <h2 id="what-title" className="text-lg font-semibold">
          Ce qu&apos;est ce site
        </h2>
        <p>
          {APP_NAME} est le blog de nos voyages : un journal privé, réservé à nos proches, où nous racontons au fil des
          jours ce que nous vivons sur la route. Chaque voyage y a son journal, fait d&apos;entrées datées avec un
          texte, des photos, des vidéos et le lieu où elles ont été prises.
        </p>
      </section>

      <section aria-labelledby="why-title" className="space-y-3 leading-relaxed">
        <h2 id="why-title" className="text-lg font-semibold">
          Pourquoi ce site
        </h2>
        <p>
          Pour retrouver facilement tous nos souvenirs de voyage en un seul endroit. Les photos dispersées dans nos
          téléphones, les messages envoyés à droite et à gauche, les anecdotes qu&apos;on finit par oublier : tout est
          réuni ici, rangé par voyage et par jour.
        </p>
        <p>
          L&apos;idée est de pouvoir les reconsulter simplement, quand on en a envie : revivre une journée, retrouver
          le nom d&apos;une plage ou d&apos;un sentier, revoir une photo, que ce soit le lendemain ou dans dix ans. Et
          de les partager avec celles et ceux qui nous suivent de loin.
        </p>
      </section>

      <section aria-labelledby="find-title" className="space-y-3 leading-relaxed">
        <h2 id="find-title" className="text-lg font-semibold">
          Ce que vous y trouverez
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>le journal de chaque voyage, entrée par entrée, avec ses photos et ses vidéos ;</li>
          <li>une carte par voyage, et une carte de tous les voyages, pour voir où nous sommes passés ;</li>
          <li>une recherche et des filtres par jour ou par tag, pour retrouver un souvenir précis ;</li>
          <li>une notification à chaque nouvelle entrée publiée.</li>
        </ul>
      </section>

      <section aria-labelledby="private-title" className="space-y-3 leading-relaxed">
        <h2 id="private-title" className="text-lg font-semibold">
          Un site privé
        </h2>
        <p>
          Il n&apos;est accessible qu&apos;avec un lien secret et un compte : rien n&apos;est public, rien n&apos;est
          référencé par les moteurs de recherche, et aucune donnée n&apos;est confiée à un service extérieur (seuls les
          fonds de carte viennent d&apos;OpenStreetMap).
        </p>
      </section>
    </article>
  );
}
