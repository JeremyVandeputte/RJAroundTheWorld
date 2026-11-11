# RJ Around The World

Journal de voyage privé (nom technique : `rjaroundtheworld`). Le site n'est accessible que par un lien secret et n'est jamais indexé par les moteurs de recherche.

> **État du projet** : Phase 1 en cours. Étape 1 (socle) terminée : configuration, base de données, migrations, interdiction d'indexation, tests. Ce README sera complété à chaque étape.

## Prérequis

- Node.js 22.12 ou plus récent (développé avec Node.js 24)
- npm

Aucun compilateur n'est nécessaire : les modules natifs sont fournis précompilés.

## Installation

```bash
npm install
```

Copier ensuite `.env.example` vers `.env` et renseigner les deux secrets. Pour générer un secret :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Lancer en local

```bash
npm run dev
```

Le site est alors disponible sur http://localhost:3000. La base de données est créée et mise à jour automatiquement au démarrage.

Pour tester la version de production en local :

```bash
npm run build
npm start
```

## Variables d'environnement

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `SESSION_SECRET` | oui | | Secret de protection des sessions (32 caractères minimum). |
| `ACCESS_TOKEN` | oui | | Token du lien secret (32 caractères minimum ; lettres, chiffres, `-` et `_`). Le changer invalide l'ancien lien pour tout le monde. |
| `APP_URL` | non | `http://localhost:3000` | URL publique du site. Doit être en `https` en production. |
| `DATABASE_PATH` | non | `./data/rjaroundtheworld.db` | Fichier de la base SQLite. |
| `MEDIA_DIR` | non | `./data/media` | Dossier des photos et vidéos. Doit rester hors de `public/`. |
| `MAX_PHOTO_MB` | non | `10` | Taille maximale d'une photo, en Mo. |
| `MAX_VIDEO_MB` | non | `300` | Taille maximale d'une vidéo, en Mo. |
| `MEDIA_QUOTA_GB` | non | `30` | Quota total des médias, en Go. |
| `SESSION_DAYS` | non | `30` | Durée d'une session, en jours. |
| `TRUST_PROXY` | non | `false` | Mettre `true` derrière un reverse proxy qui renseigne `X-Forwarded-For`. |

Le serveur refuse de démarrer si une variable est invalide et indique laquelle, sans jamais afficher sa valeur.

## Base de données et migrations

- Le schéma est défini dans `src/server/db/schema.ts`.
- Les migrations SQL sont dans `drizzle/` et sont appliquées automatiquement au démarrage du serveur.
- Pour les appliquer à la main : `npm run db:migrate`.
- Après une modification du schéma, générer une nouvelle migration : `npm run db:generate -- --name description_courte`.

## Tests

```bash
npm test          # lance tous les tests
npm run typecheck # vérifie les types TypeScript
```

Les tests utilisent une base SQLite en mémoire, avec les vraies migrations.

## Confidentialité

- En-tête `X-Robots-Tag: noindex, nofollow` sur toutes les réponses, balise meta `noindex` et `robots.txt` qui interdit tout.
- Pas de sitemap ni de métadonnées de partage (Open Graph).
- La télémétrie de Next.js est désactivée dans `next.config.ts`.
- En production, le serveur n'émet aucune requête vers l'extérieur. En développement et à la compilation, Next.js interroge le registre npm pour connaître sa dernière version (aucune donnée du site n'est transmise).

## Structure

```
drizzle/            migrations SQL
scripts/            scripts en ligne de commande
src/app/            pages et routes (Next.js App Router)
src/lib/            code partagé (configuration, nom du site)
src/server/db/      schéma et connexion à la base
tests/              tests automatisés
```
