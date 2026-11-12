# RJ Around The World

Journal de voyage privé (nom technique : `rjaroundtheworld`). Le site n'est accessible que par un lien secret et n'est jamais indexé par les moteurs de recherche.

> **État du projet** : Phase 1 en cours. Étapes terminées : 1 (socle), 2 (lien secret, connexion, sessions, profil), 3 (administration des comptes, permissions), 4 (voyages et entrées), 5 (photos et vidéos), 6 (carte), 7 (commentaires et réactions) et 8 (notifications). Reste : l'étape 9 (finitions et relecture). Ce README est complété à chaque étape.

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

- Le superuser et les comptes ayant la permission **Gérer les voyages** peuvent créer des voyages (bouton « Nouveau voyage » sur l'accueil). Le compte qui crée un voyage en est l'auteur.
- Seuls **l'auteur du voyage et le superuser** peuvent le modifier, changer sa visibilité ou le supprimer (« Modifier le voyage » sur la page du voyage). Si la permission Gérer les voyages est retirée à l'auteur, il ne peut plus agir sur ses voyages.
- Un voyage est créé **non visible** par défaut. Tant qu'il l'est, lui et toutes ses entrées (même publiées) n'existent que pour son auteur et le superuser : pour tous les autres, ses adresses répondent 404, comme si le voyage n'existait pas. Cela vaut aussi pour quelqu'un qui y avait écrit une entrée avant que le voyage ne soit masqué.
- Cocher « Voyage visible » le révèle d'un coup avec toutes ses entrées publiées.
- Suppression (en bas de « Modifier le voyage ») : le voyage est supprimé avec toutes ses entrées, y compris celles écrites par d'autres personnes, leurs commentaires et leurs réactions.
- Si le compte de l'auteur est supprimé, le voyage reste et seul le superuser peut le gérer.
- L'adresse d'un voyage est construite à partir de son titre à la création et ne change plus ensuite.

### Entrées

- « Enregistrer le brouillon » crée ou met à jour un brouillon, visible uniquement par son auteur et le superuser. Le lieu est facultatif à ce stade.
- « Publier » rend l'entrée visible (si son voyage l'est). Un lieu (point A) et au moins une personne identifiée sont alors obligatoires.
- Une entrée publiée reste publiée quand on la modifie. « Retirer » la repasse en brouillon.
- Un auteur peut supprimer ses propres entrées ; le superuser peut modifier et supprimer toutes les entrées.
- Texte : `**gras**` et `[texte du lien](https://…)` uniquement ; une adresse `https://…` collée telle quelle devient aussi un lien. Tout le reste est affiché tel que saisi : aucun HTML n'est interprété, et seuls les liens `http` et `https` sont cliquables.
- Lieu : un point (lieu fixe) ou deux points A et B (trajet à sens unique), chacun avec un nom facultatif, choisis sur la carte (voir « Carte »).
- Personnes identifiées : n'importe quels comptes actifs du site.

## Carte

La carte utilise Leaflet (inclus dans le site, aucun CDN) et les fonds de carte d'OpenStreetMap : pas de clé API, pas de service payant.

- **Choisir un lieu** : dans le formulaire d'une entrée, un clic (ou un appui) sur la carte place le lieu. « Ajouter une arrivée (point B) » permet de placer un second point pour un trajet à sens unique ; A et B sont alors reliés par un trait droit (aucun calcul d'itinéraire). Un marqueur se déplace en le faisant glisser ou en cliquant ailleurs. « Retirer le point B » et « Effacer le lieu » annulent.
- **Centrer sur ma position** : ce bouton n'apparaît qu'en `https` (ou sur `localhost`), car les navigateurs n'autorisent la localisation que sur une connexion sécurisée. Il centre la carte, sans placer de point.
- **Carte du voyage** : bouton « Carte » sur la page du voyage. Un marqueur par lieu des entrées publiées ; les trajets affichent A et B reliés. Un clic sur un marqueur ouvre l'entrée.
- **Page d'une entrée** : une petite carte montre son lieu ou son trajet.
- **Visibilité** : seules les entrées publiées que la personne a le droit de voir sont envoyées au navigateur. Les brouillons n'apparaissent jamais sur la carte, même pour leur auteur, et la carte d'un voyage non visible répond 404.
- **Données envoyées à l'extérieur** : les fonds de carte sont le seul appel du site vers un tiers. OpenStreetMap reçoit la zone affichée et le nom de domaine du site, jamais l'adresse de la page.

## Commentaires et réactions

Ils se trouvent en bas de la page d'une entrée publiée.

- **Qui les voit** : uniquement les personnes connectées qui ont le droit de voir l'entrée. Un visiteur sans compte ne reçoit rien, pas même un compteur : la page lui propose seulement de se connecter.
- **Commenter** : demande la permission Commenter. Texte simple de 2 000 caractères au maximum, sauts de ligne conservés, aucune mise en forme.
- **Répondre** : « Répondre » sous un commentaire. Un seul niveau : répondre à une réponse la place sous le même commentaire de départ.
- **Modifier, supprimer** : chacun modifie et supprime ses propres commentaires et réponses (mention « modifié » après une modification) ; le superuser peut modifier et supprimer tous les commentaires. L'auteur d'une entrée ne peut pas supprimer les commentaires des autres.
- **Suppression d'un commentaire qui a des réponses** : il est remplacé par « Commentaire supprimé » (son texte et ses réactions sont réellement effacés) pour ne pas casser le fil ; cet emplacement disparaît avec sa dernière réponse.
- **Réactions** : J'aime 👍, J'adore ❤️, Haha 😆, Wouah 😮, Triste 😢, En colère 😡, sur l'entrée et sur chaque commentaire ou réponse. Demande la permission Réagir. Une seule réaction par personne et par élément : en choisir une autre la remplace, recliquer sur la sienne la retire.
- **Qui a réagi** : chaque décompte est accompagné de la liste « voir qui a réagi ».
- Un compte sans Commenter ni Réagir lit les commentaires et les décomptes, sans pouvoir intervenir.
- Les heures sont affichées dans le fuseau de l'appareil qui consulte.

## Notifications

Une cloche dans l'en-tête indique le nombre de notifications non lues ; elle mène à la page « Notifications ». Il n'y a ni temps réel ni e-mail : les notifications apparaissent au chargement d'une page.

| Événement | Qui est notifié |
|---|---|
| Première publication d'une entrée | Toutes les personnes qui peuvent la voir, sauf son auteur ; mention « Vous apparaissez dans cette entrée » pour les personnes identifiées |
| Commentaire sur une entrée | L'auteur de l'entrée et les personnes identifiées |
| Réaction à une entrée | L'auteur de l'entrée et les personnes identifiées |
| Réponse à un commentaire (ou à une réponse) | L'auteur du commentaire auquel on répond |
| Réaction à un commentaire ou à une réponse | Son auteur |

- **Jamais à soi-même** : la personne qui agit n'est jamais notifiée.
- **Voyage non visible** : seules les personnes qui y ont accès (son auteur et le superuser) sont notifiées. Une personne identifiée dans une entrée d'un voyage masqué n'est pas notifiée.
- **Pas de doublon** : retirer puis republier une entrée ne renotifie pas ; changer de réaction met à jour la notification existante ; retirer sa réaction supprime la notification.
- **Toujours à jour** : une notification disparaît si son objet n'est plus visible (voyage masqué, entrée retirée, commentaire supprimé) et réapparaît s'il le redevient.
- **Lecture** : toucher une notification mène directement à l'entrée ou au commentaire concerné et la marque comme lue. « Marquer comme lue » et « Tout marquer comme lu » marquent sans quitter la page. Les 100 notifications les plus récentes sont affichées.

## Connexion instable

Le site est pensé pour être utilisé sur un téléphone avec un réseau irrégulier :

- un commentaire envoyé sans réseau reste dans sa zone de saisie, avec un message ;
- les envois de photos et vidéos reprennent seuls après une coupure courte, et à la demande après une coupure longue (voir ci-dessous) ;
- si « Enregistrer » ou « Publier » est utilisé sans réseau, un message s'affiche et le formulaire reste intact : titre, texte, lieu et personnes ne sont pas perdus ;
- un refus du serveur (lieu manquant, par exemple) laisse aussi le formulaire tel qu'il a été rempli ;
- si le serveur rencontre une erreur, le message le dit (au lieu de parler de coupure réseau) et invite à recharger la page pour vérifier si l'action a été enregistrée ;
- ailleurs, une action qui échoue affiche une page « Une erreur est survenue » avec un bouton « Réessayer ».

## Photos et vidéos

Les photos et vidéos s'ajoutent depuis « Modifier l'entrée », section « Photos et vidéos » (sur une nouvelle entrée : bouton « Enregistrer le brouillon et ajouter des photos »). Chaque fichier est enregistré dès qu'il est envoyé, sans attendre « Enregistrer ».

- **Stockage** : les fichiers sont sur le disque, dans `MEDIA_DIR` (hors de `public/`), un dossier par entrée. La base ne garde que le chemin et les métadonnées.
- **Photos** : JPEG, PNG ou WebP, 10 Mo maximum par défaut. Chaque photo est redressée, réduite à 2000 px sur le grand côté et convertie en JPEG, avec une miniature de 480 px. L'original n'est pas conservé.
- **Vie privée** : les fichiers enregistrés ne contiennent plus aucune métadonnée (position GPS, modèle d'appareil). La position et la date de prise de vue sont seulement notées en base, pour la Phase 2.
- **Vidéos** : MP4, MOV ou WebM, 300 Mo maximum par défaut, enregistrées telles quelles (pas de conversion en Phase 1) et lues par le lecteur du navigateur.
- **Quota** : 30 Go au total par défaut. Un envoi qui le dépasserait est refusé avant d'être reçu. 100 fichiers au maximum par entrée.
- **Envoi robuste** : un fichier est envoyé par morceaux de 4 Mo. Si la connexion saute, le morceau en cours est renvoyé automatiquement (4 nouvelles tentatives) ; au-delà, l'envoi s'arrête avec un message et le bouton « Reprendre l'envoi » repart d'où il s'était arrêté, tant que la page reste ouverte.
- **Accès** : aucun fichier n'a d'adresse publique. Ils passent par `/api/media/<identifiant aléatoire>`, qui applique les mêmes règles que la page de l'entrée : lien secret, voyage visible, entrée publiée. Dans tous les autres cas la réponse est un 404.
- **Suppression** : supprimer une entrée ou un voyage supprime aussi ses fichiers du disque.

Limites connues de la Phase 1 :

- Les photos HEIC ne sont pas prises en charge. L'iPhone convertit normalement en JPEG à l'envoi ; sinon, régler Appareil photo > Formats > « Le plus compatible ».
- Les vidéos ne sont pas converties : une vidéo iPhone en HEVC peut ne pas se lire dans certains navigateurs (même réglage conseillé).
- Les vidéos n'ont pas de miniature.
- Un envoi interrompu ne peut pas être repris après fermeture ou rechargement de la page. Les fichiers temporaires abandonnés sont nettoyés au bout de 24 heures.
- Si la réponse du serveur se perd juste après l'envoi d'une petite photo, celle-ci peut apparaître en double : il suffit de supprimer le doublon.

## Tester depuis un téléphone

Avec `npm run dev`, le site est aussi accessible depuis un téléphone connecté au même réseau Wi-Fi :

1. Trouver l'adresse de l'ordinateur sur le réseau local (`ipconfig` sous Windows, ligne « Adresse IPv4 », par exemple `192.168.1.20`).
2. La mettre dans `.env` : `DEV_ALLOWED_ORIGINS=192.168.1.20`, puis relancer `npm run dev`.
3. Sur le téléphone, ouvrir `http://192.168.1.20:3000/access/<ACCESS_TOKEN>`.

Si le téléphone n'atteint pas le site, le pare-feu de l'ordinateur bloque probablement Node.js : autoriser l'accès sur les réseaux privés. Le bouton « Copier » ne fonctionne pas dans ce mode (le presse-papiers exige `https` ou `localhost`).

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

| | Visiteur (lien seul) | User | Superuser |
|---|---|---|---|
| Voir un voyage visible et ses entrées publiées | oui | oui | oui |
| Voir un voyage non visible et ses entrées | non | l'auteur du voyage | oui |
| Voir un brouillon | non | son auteur | oui |
| Créer une entrée | non | si Publier | oui |
| Modifier ou supprimer une entrée | non | les siennes, si Publier | oui |
| Voir les commentaires et réactions | non | oui | oui |
| Commenter | non | si Commenter | oui |
| Modifier ou supprimer un commentaire | non | les siens, si Commenter | oui |
| Réagir | non | si Réagir | oui |
| Créer un voyage | non | si Gérer les voyages | oui |
| Modifier, masquer ou supprimer un voyage | non | les siens, si Gérer les voyages | oui |
| Gérer les comptes | non | non | oui |

Tout ce qui concerne les entrées, commentaires et réactions ne vaut que dans les voyages que la personne peut voir.

Les quatre permissions sont indépendantes. Pour préparer un voyage masqué et y écrire, un compte a besoin de Gérer les voyages (pour le créer) et de Publier (pour y écrire). Un compte désactivé, ou qui doit d'abord changer son mot de passe, n'a pas plus de droits qu'un visiteur.

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
| `DEV_ALLOWED_ORIGINS` | non | | Développement uniquement : adresses autorisées à utiliser `npm run dev` depuis un autre appareil (voir « Tester depuis un téléphone »). |

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
src/components/     composants d'interface (dont `map/` : carte et choix du lieu)
src/lib/            code partagé (configuration, textes, nom du site)
src/proxy.ts        contrôle d'accès appliqué à toutes les requêtes
src/server/actions/ actions de formulaire (couche fine)
src/server/auth/    lien secret, sessions, mots de passe, anti brute force
src/server/db/      schéma et connexion à la base
src/server/media/   fichiers sur disque : envoi par morceaux, traitement des photos, stockage
src/app/api/        routes d'envoi et de lecture des médias
src/server/permissions.ts  matrice de permissions (source unique)
src/server/services/ logique métier, couverte par les tests
tests/              tests automatisés
```
