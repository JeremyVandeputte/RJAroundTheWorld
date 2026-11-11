# RJ Around The World

Journal de voyage privé (nom technique : `rjaroundtheworld`). Le site n'est accessible que par un lien secret et n'est jamais indexé par les moteurs de recherche.

> **État du projet** : Phase 1 en cours. Étapes terminées : 1 (socle), 2 (lien secret, connexion, sessions, profil), 3 (administration des comptes, permissions) et 4 (voyages et entrées). Restent : médias, carte, commentaires et réactions, notifications. Ce README est complété à chaque étape.

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

## Voyages et entrées

### Voyages

- Le superuser et les comptes ayant la permission **Gérer les voyages** créent et modifient les voyages (bouton « Nouveau voyage » sur l'accueil, « Modifier le voyage » sur la page du voyage). Cette permission porte sur tous les voyages, pas seulement ceux que l'on a créés.
- Un voyage est créé **non visible** par défaut. Tant qu'il l'est, lui et toutes ses entrées (même publiées) n'existent que pour le superuser et les comptes ayant la permission Publier ou Gérer les voyages : pour tous les autres, ses adresses répondent 404, comme si le voyage n'existait pas.
- Cocher « Voyage visible » le révèle d'un coup avec toutes ses entrées publiées.
- Suppression (en bas de « Modifier le voyage ») : un voyage vide peut être supprimé par qui gère les voyages. Un voyage qui contient des entrées ne peut être supprimé que par le superuser, avec toutes ses entrées, leurs commentaires et leurs réactions.
- L'adresse d'un voyage est construite à partir de son titre à la création et ne change plus ensuite.

### Entrées

- « Enregistrer le brouillon » crée ou met à jour un brouillon, visible uniquement par son auteur et le superuser. Le lieu est facultatif à ce stade.
- « Publier » rend l'entrée visible (si son voyage l'est). Un lieu (point A) est alors obligatoire.
- Une entrée publiée reste publiée quand on la modifie. « Retirer » la repasse en brouillon.
- Un auteur peut supprimer ses propres entrées ; le superuser peut modifier et supprimer toutes les entrées.
- Texte : `**gras**` et `[texte du lien](https://…)` uniquement ; une adresse `https://…` collée telle quelle devient aussi un lien. Tout le reste est affiché tel que saisi : aucun HTML n'est interprété, et seuls les liens `http` et `https` sont cliquables.
- Lieu : un point (lieu fixe) ou deux points A et B (trajet à sens unique), chacun avec un nom facultatif. En attendant la carte (étape 6), les coordonnées se saisissent à la main.
- Personnes identifiées : n'importe quels comptes actifs du site.

## Administration

La page « Administration » (lien dans l'en-tête, visible du superuser uniquement) permet de :

- **créer un compte** : identifiant, nom affiché et permissions. Un mot de passe temporaire est généré et affiché une seule fois ; la personne doit choisir le sien dès sa première connexion ;
- **régler les permissions** de chaque compte, une par une : Commenter et Réagir (activées par défaut), Publier et Gérer les voyages (désactivées par défaut) ;
- **réinitialiser un mot de passe oublié** : nouveau mot de passe temporaire affiché une seule fois, sessions du compte fermées, blocage de connexion levé ;
- **forcer un changement de mot de passe** sans toucher au mot de passe actuel ;
- **désactiver ou réactiver** un compte : un compte désactivé est déconnecté partout et ne peut plus se connecter ;
- **supprimer** un compte : ses commentaires et réactions sont supprimés (un commentaire qui a des réponses est remplacé par « commentaire supprimé »). Un compte qui a écrit des entrées ne peut pas être supprimé : il faut le désactiver ;
- **retrouver le lien secret** pour le copier.

Le compte superuser ne peut être ni désactivé, ni supprimé, ni réinitialisé depuis cette page : son mot de passe se gère dans « Mon profil » ou avec `npm run create-superuser`.

### Permissions

Toutes les règles sont dans un seul fichier, `src/server/permissions.ts`, appelé par les services côté serveur. L'interface ne fait que masquer ce qui serait refusé de toute façon.

| | Visiteur (lien seul) | User | User + Publier | User + Gérer les voyages | Superuser |
|---|---|---|---|---|---|
| Voir un voyage visible et ses entrées publiées | oui | oui | oui | oui | oui |
| Voir un voyage non visible | non | non | oui | oui | oui |
| Voir un brouillon | non | les siens | les siens | les siens | oui |
| Créer une entrée | non | non | oui | non | oui |
| Modifier ou supprimer une entrée | non | non | les siennes | non | oui |
| Voir les commentaires et réactions | non | oui | oui | oui | oui |
| Commenter | non | si Commenter | si Commenter | si Commenter | oui |
| Modifier ou supprimer un commentaire | non | les siens | les siens | les siens | oui |
| Réagir | non | si Réagir | si Réagir | si Réagir | oui |
| Créer ou modifier un voyage, changer sa visibilité | non | non | non | oui | oui |
| Supprimer un voyage vide | non | non | non | oui | oui |
| Supprimer un voyage avec ses entrées | non | non | non | non | oui |
| Gérer les comptes | non | non | non | non | oui |

Les quatre permissions sont indépendantes : un compte peut avoir à la fois Publier et Gérer les voyages. Un compte désactivé, ou qui doit d'abord changer son mot de passe, n'a pas plus de droits qu'un visiteur.

## Comptes et sécurité

- Pas d'inscription libre : seuls le script `create-superuser` et la page d'administration créent des comptes.
- Un mot de passe temporaire n'est jamais stocké en clair : seul son hachage est enregistré.
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
src/server/permissions.ts  matrice de permissions (source unique)
src/server/services/ logique métier, couverte par les tests
tests/              tests automatisés
```
