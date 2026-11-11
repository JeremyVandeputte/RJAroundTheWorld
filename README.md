# RJ Around The World

Journal de voyage privé (nom technique : `rjaroundtheworld`). Le site n'est accessible que par un lien secret et n'est jamais indexé par les moteurs de recherche.

> **État du projet** : Phase 1 en cours. Étapes terminées : 1 (socle) et 2 (lien secret, connexion, sessions, profil). Ce README est complété à chaque étape.

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

## Créer le compte superuser

```bash
npm run create-superuser
```

Le script demande l'identifiant, le nom affiché et le mot de passe (10 caractères minimum, les mots de passe trop courants sont refusés). Il n'y a qu'un seul superuser.

Si le superuser existe déjà, le même script propose de lui définir un nouveau mot de passe : c'est la procédure à suivre si tu oublies le tien. Toutes ses sessions sont alors fermées.

Pour un usage automatisé, les réponses peuvent être fournies par les variables `SUPERUSER_USERNAME`, `SUPERUSER_DISPLAY_NAME` et `SUPERUSER_PASSWORD`.

## Lien secret

Le site ne répond qu'aux navigateurs qui ont ouvert le lien secret au moins une fois :

```
<APP_URL>/access/<ACCESS_TOKEN>
```

En local : `http://localhost:3000/access/` suivi de la valeur de `ACCESS_TOKEN` dans `.env`.

- Le lien dépose un cookie d'accès valable 400 jours, puis redirige vers l'accueil : le token ne reste pas dans la barre d'adresse.
- Sans ce cookie, toutes les adresses (pages, connexion, fichiers) renvoient la même réponse 404 neutre. Seul `robots.txt` reste public.
- Le lien est fixe. En cas de fuite, changer `ACCESS_TOKEN` dans la configuration puis redémarrer : l'ancien lien et tous les cookies d'accès cessent de fonctionner, et il faut transmettre le nouveau lien à tout le monde.

## Comptes et sécurité

- Pas d'inscription libre : seuls le script ci-dessus et (à partir de l'étape 3) la page d'administration créent des comptes.
- Mots de passe hachés avec argon2id. La vérification des mots de passe trop courants est locale (aucun appel externe).
- Sessions par cookie `httpOnly`, `sameSite=lax`, et `Secure` dès que `APP_URL` est en `https`. Une session expire après `SESSION_DAYS` jours sans visite.
- Changer son mot de passe (page « Mon profil ») ferme toutes les autres sessions du compte.
- Anti brute force : 5 échecs en 15 minutes bloquent l'identifiant pendant 15 minutes ; 20 échecs bloquent l'adresse IP (derrière un reverse proxy, avec `TRUST_PROXY=true`).
- Protection CSRF : toute requête de modification doit provenir du site lui-même (en-tête `Origin` égal à `APP_URL`).

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
src/components/     composants d'interface
src/lib/            code partagé (configuration, textes, nom du site)
src/proxy.ts        contrôle d'accès appliqué à toutes les requêtes
src/server/actions/ actions de formulaire (couche fine)
src/server/auth/    lien secret, sessions, mots de passe, anti brute force
src/server/db/      schéma et connexion à la base
src/server/services/ logique métier, couverte par les tests
tests/              tests automatisés
```
