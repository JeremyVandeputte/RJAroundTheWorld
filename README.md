# RJ Around The World

Journal de voyage privé, pour raconter nos voyages à nos proches : entrées datées avec texte, photos, vidéos et lieu sur une carte, commentaires, réactions et notifications.

Le site n'est accessible que par un **lien secret**, puis **avec un compte** : rien n'est lisible sans être connecté. Il n'est jamais indexé par les moteurs de recherche. Il est pensé pour un usage sur téléphone, y compris avec une connexion instable.

Nom technique (dépôt, paquet, base de données) : `rjaroundtheworld`.

> **État** : Phase 1 terminée. La Phase 2 (voir en fin de document) n'est pas commencée.

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [Sécurité et confidentialité](#sécurité-et-confidentialité)
- [Mise en production](#mise-en-production)
- [Sauvegardes](#sauvegardes)
- [Développement](#développement)
- [Limites connues](#limites-connues)
- [Phase 2](#phase-2)

## Démarrage rapide

Prérequis : Node.js 22.12 ou plus récent (développé avec Node.js 24) et npm. Aucun compilateur n'est nécessaire : les modules natifs sont fournis précompilés.

1. **Installer les dépendances**

   ```bash
   npm install
   ```

2. **Configurer** : copier `.env.example` vers `.env` et renseigner les deux secrets, `SESSION_SECRET` et `ACCESS_TOKEN`. Pour générer chacun d'eux :

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

3. **Créer le compte superuser** (le compte administrateur, unique) :

   ```bash
   npm run create-superuser
   ```

   Le script demande l'identifiant, le nom affiché et le mot de passe (10 caractères minimum ; les mots de passe trop courants sont refusés). Il crée la base de données au passage.

4. **Lancer le site**

   ```bash
   npm run dev
   ```

5. **Ouvrir le lien secret** : `http://localhost:3000/access/` suivi de la valeur de `ACCESS_TOKEN`. Il mène à la page de connexion. Sans ce lien, le site répond « Not Found » partout.

Si tu oublies le mot de passe du superuser, relance `npm run create-superuser` : il propose d'en définir un nouveau et ferme toutes les sessions du compte. Pour un usage automatisé, les réponses peuvent être passées par les variables `SUPERUSER_USERNAME`, `SUPERUSER_DISPLAY_NAME` et `SUPERUSER_PASSWORD`.

## Configuration

Toute la configuration passe par des variables d'environnement (fichier `.env` en local). Le serveur refuse de démarrer si une variable est invalide et indique laquelle, sans jamais afficher sa valeur.

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `SESSION_SECRET` | oui | | Secret de protection des sessions (32 caractères minimum). Le changer déconnecte tout le monde. |
| `ACCESS_TOKEN` | oui | | Token du lien secret (32 caractères minimum ; lettres, chiffres, `-` et `_`). Le changer invalide l'ancien lien pour tout le monde. |
| `APP_URL` | non | `http://localhost:3000` | Adresse publique du site, sans `/` final. Obligatoirement en `https` en production. |
| `DATABASE_PATH` | non | `./data/rjaroundtheworld.db` | Fichier de la base SQLite. |
| `MEDIA_DIR` | non | `./data/media` | Dossier des photos et vidéos. Doit rester hors de `public/`. |
| `MAX_PHOTO_MB` | non | `10` | Taille maximale d'une photo envoyée, en Mo. |
| `MAX_VIDEO_MB` | non | `300` | Taille maximale d'une vidéo, en Mo. |
| `MEDIA_QUOTA_GB` | non | `30` | Espace total réservé aux photos et vidéos, en Go. |
| `SESSION_DAYS` | non | `30` | Durée d'une session sans visite, en jours. |
| `TRUST_PROXY` | non | `false` | `true` derrière un reverse proxy qui ajoute l'adresse du visiteur à `X-Forwarded-For` (sert à l'anti brute force). |
| `DEV_ALLOWED_ORIGINS` | non | | Développement uniquement : adresses autorisées à utiliser `npm run dev` depuis un autre appareil (voir [Tester depuis un téléphone](#tester-depuis-un-téléphone)). |

## Utilisation

### Lien secret

Le site ne répond qu'aux navigateurs qui ont ouvert le lien secret au moins une fois : `<APP_URL>/access/<ACCESS_TOKEN>`. Le superuser le retrouve en bas de la page « Administration », avec un bouton pour le copier.

- Le lien dépose un cookie d'accès valable 400 jours, puis redirige vers la page de connexion : le token ne reste pas dans la barre d'adresse.
- Il doit être ouvert une fois sur chaque appareil. Sans le cookie, toutes les adresses (pages, connexion, fichiers) renvoient la même réponse 404 neutre ; seul `robots.txt` est public.
- Le lien ne donne accès qu'à la page de connexion. **Tout le reste demande un compte** : sans être connecté, chaque page renvoie vers la connexion, et les photos et vidéos répondent 404.
- Le lien est fixe. En cas de fuite, changer `ACCESS_TOKEN` et redémarrer : l'ancien lien et tous les cookies d'accès cessent de fonctionner, et il faut transmettre le nouveau lien à tout le monde.

### Comptes et permissions

Pas d'inscription libre : seuls le script `create-superuser` et la page « Administration » (réservée au superuser) créent des comptes. Cette page permet de :

- **créer un compte** : identifiant, nom affiché et permissions. Un mot de passe temporaire est généré et affiché une seule fois ; la personne doit choisir le sien dès sa première connexion ;
- **régler les permissions** de chaque compte, une par une : Commenter et Réagir (activées par défaut), Publier et Gérer les voyages (désactivées par défaut) ;
- **réinitialiser un mot de passe oublié** : nouveau mot de passe temporaire affiché une seule fois, sessions du compte fermées, blocage de connexion levé ;
- **forcer un changement de mot de passe** sans toucher au mot de passe actuel ;
- **désactiver ou réactiver** un compte : un compte désactivé est déconnecté partout et ne peut plus se connecter ;
- **supprimer** un compte : ses commentaires et réactions sont supprimés (un commentaire qui a des réponses devient « Commentaire supprimé »). Un compte qui a écrit des entrées ne peut pas être supprimé : il faut le désactiver.

Le compte superuser ne peut être ni désactivé, ni supprimé, ni réinitialisé depuis cette page : son mot de passe se change dans « Mon profil » ou avec `npm run create-superuser`.

Chacun change son mot de passe dans « Mon profil » (clic sur son nom, en haut à droite) : mot de passe actuel, puis le nouveau deux fois. Cela ferme ses autres sessions.

Toutes les règles d'accès sont dans un seul fichier, `src/server/permissions.ts`, appliqué côté serveur à chaque page, action et fichier. L'interface ne fait que masquer ce qui serait refusé de toute façon.

| | User | Superuser |
|---|---|---|
| Voir un voyage visible et ses entrées publiées | oui | oui |
| Voir un voyage non visible et ses entrées | son auteur | oui |
| Voir un brouillon | son auteur | oui |
| Créer une entrée | si Publier | oui |
| Modifier, retirer ou supprimer une entrée | les siennes, si Publier | oui |
| Voir les commentaires et réactions | oui | oui |
| Commenter, répondre | si Commenter | oui |
| Modifier ou supprimer un commentaire | les siens, si Commenter | oui |
| Réagir | si Réagir | oui |
| Créer un voyage | si Gérer les voyages | oui |
| Modifier, masquer ou supprimer un voyage | les siens, si Gérer les voyages | oui |
| Gérer les comptes | non | oui |

Sans compte, rien n'est accessible : seule la page de connexion répond.

Tout ce qui concerne les entrées, commentaires et réactions ne vaut que dans les voyages que la personne peut voir. Les quatre permissions sont indépendantes : pour préparer un voyage masqué et y écrire, il faut Gérer les voyages (pour le créer) et Publier (pour y écrire). Un compte désactivé, ou qui doit d'abord changer son mot de passe, n'a accès à rien d'autre que sa page de profil.

### Voyages

- « Nouveau voyage » sur l'accueil (superuser et comptes ayant Gérer les voyages). Le compte qui crée un voyage en est l'auteur.
- Un voyage est créé **non visible** par défaut. Tant qu'il l'est, lui et toutes ses entrées, même publiées, n'existent que pour son auteur et le superuser : pour tous les autres, ses adresses répondent 404, comme s'il n'existait pas. Cela vaut aussi pour quelqu'un qui y avait écrit avant qu'il ne soit masqué.
- Cocher « Voyage visible » le révèle d'un coup avec toutes ses entrées publiées.
- Seuls l'auteur du voyage (s'il a toujours Gérer les voyages) et le superuser peuvent le modifier, changer sa visibilité ou le supprimer. La suppression emporte toutes ses entrées, y compris celles écrites par d'autres, avec leurs photos, commentaires et réactions.
- Si le compte de l'auteur est supprimé, le voyage reste et seul le superuser peut le gérer.
- L'adresse d'un voyage est construite à partir de son titre à la création et ne change plus ensuite.

### Entrées

- « Nouvelle entrée » sur la page du voyage (comptes ayant Publier). La date est préremplie à aujourd'hui.
- « Enregistrer le brouillon » crée ou met à jour un brouillon, visible uniquement par son auteur et le superuser.
- « Publier » rend l'entrée visible (si son voyage l'est). Un lieu (point A) et au moins une personne identifiée sont alors obligatoires.
- Une entrée publiée reste publiée quand on la modifie. « Retirer (repasser en brouillon) » la cache de nouveau.
- Un auteur peut supprimer ses propres entrées ; le superuser peut modifier et supprimer toutes les entrées.
- **Texte** : `**gras**` et `[texte du lien](https://…)` uniquement ; une adresse `https://…` collée telle quelle devient aussi un lien. Tout le reste s'affiche tel que saisi : aucun HTML n'est interprété, et seuls les liens `http` et `https` sont cliquables.
- **Personnes identifiées** : n'importe quels comptes actifs du site.

### Photos et vidéos

Elles s'ajoutent depuis « Modifier l'entrée », section « Photos et vidéos ». Sur une nouvelle entrée, le bouton « Enregistrer le brouillon et ajouter des photos » y mène directement. Chaque fichier est enregistré dès qu'il est envoyé, sans attendre « Enregistrer ».

- **Photos** : JPEG, PNG ou WebP, 10 Mo maximum par défaut. Chaque photo est redressée, réduite à 2000 px sur le grand côté et convertie en JPEG, avec une miniature de 480 px. L'original n'est pas conservé.
- **Vie privée** : les fichiers enregistrés ne contiennent plus aucune métadonnée (position GPS, modèle d'appareil). La position et la date de prise de vue sont seulement notées en base, pour la Phase 2.
- **Vidéos** : MP4, MOV ou WebM, 300 Mo maximum par défaut, enregistrées telles quelles et lues par le lecteur du navigateur.
- **Quota** : 30 Go au total par défaut ; un envoi qui le dépasserait est refusé avant d'être reçu. 100 fichiers au maximum par entrée.
- **Affichage** : miniatures chargées au fil du défilement ; un appui ouvre la photo en grand. La première photo d'une entrée sert de vignette dans la liste du voyage.
- **Stockage** : sur le disque, dans `MEDIA_DIR`, un dossier par entrée ; la base ne garde que le chemin et les métadonnées. Supprimer une entrée ou un voyage supprime ses fichiers.

### Carte

La carte utilise Leaflet (inclus dans le site, aucun CDN) et les fonds de carte d'OpenStreetMap : pas de clé API, pas de service payant.

- **Choisir un lieu** : dans le formulaire d'une entrée, un appui sur la carte place le lieu. « Ajouter une arrivée (point B) » place un second point pour un trajet à sens unique ; A et B sont reliés par un trait droit (aucun calcul d'itinéraire). Un marqueur se déplace en le faisant glisser ou en touchant ailleurs. Chaque point peut recevoir un nom.
- **Centrer sur ma position** : n'apparaît qu'en `https` (ou sur `localhost`), car les navigateurs n'autorisent la localisation que sur une connexion sécurisée. Centre la carte, sans placer de point.
- **Carte du voyage** : bouton « Carte » sur la page du voyage. Un marqueur par lieu des entrées publiées ; un appui sur un marqueur ouvre l'entrée.
- **Page d'une entrée** : une petite carte montre son lieu ou son trajet.
- Les brouillons n'apparaissent jamais sur la carte, même pour leur auteur.

### Commentaires et réactions

En bas de la page d'une entrée publiée, visibles par toutes les personnes qui peuvent voir l'entrée.

- **Commenter** (permission Commenter) : texte simple, 2 000 caractères au maximum, sauts de ligne conservés.
- **Répondre** : un seul niveau ; répondre à une réponse la place sous le même commentaire de départ.
- **Modifier, supprimer** : chacun ses propres commentaires (mention « modifié ») ; le superuser, tous. L'auteur d'une entrée ne peut pas supprimer les commentaires des autres.
- Un commentaire supprimé qui a des réponses devient « Commentaire supprimé » (son texte et ses réactions sont réellement effacés) pour ne pas casser le fil ; cet emplacement disparaît avec sa dernière réponse.
- **Réactions** (permission Réagir) : J'aime 👍, J'adore ❤️, Haha 😆, Wouah 😮, Triste 😢, En colère 😡, sur l'entrée et sur chaque commentaire ou réponse. Une seule par personne et par élément : en choisir une autre la remplace, retoucher la sienne la retire. « Voir qui a réagi » donne la liste.
- Les heures s'affichent dans le fuseau de l'appareil qui consulte.

### Notifications

La cloche de l'en-tête indique le nombre de notifications non lues et mène à la page « Notifications ». Ni temps réel ni e-mail : elles apparaissent au chargement d'une page.

| Événement | Qui est notifié |
|---|---|
| Première publication d'une entrée | Toutes les personnes qui peuvent la voir, sauf son auteur ; mention « Vous apparaissez dans cette entrée » pour les personnes identifiées |
| Personne identifiée après la publication (ou pendant que l'entrée était retirée) | Cette personne, une seule fois |
| Commentaire ou réaction sur une entrée | L'auteur de l'entrée et les personnes identifiées |
| Réponse à un commentaire (ou à une réponse) | L'auteur du commentaire auquel on répond |
| Réaction à un commentaire ou à une réponse | Son auteur |
| Voyage rendu visible (ou créé directement visible) | Toutes les personnes qui peuvent désormais le voir, une seule fois par voyage |

- Jamais à soi-même, et rien sur un voyage masqué pour qui n'y a pas accès.
- Pas de doublon : retirer puis republier une entrée ne renotifie pas ; changer de réaction met à jour la notification ; retirer sa réaction la supprime.
- Une notification disparaît si son objet n'est plus visible (voyage masqué, entrée retirée, commentaire supprimé, personne retirée de l'entrée) et réapparaît s'il le redevient.
- Toucher une notification mène à l'entrée ou au commentaire concerné et la marque comme lue. « Marquer comme lue » et « Tout marquer comme lu » marquent sans quitter la page. Les 100 plus récentes sont affichées.

### Connexion instable

- **Envoi de photos et vidéos** : par morceaux de 4 Mo. Après une coupure courte, le morceau en cours est renvoyé automatiquement (4 nouvelles tentatives). Après une coupure plus longue, l'envoi s'arrête avec un message, et « Reprendre l'envoi » repart d'où il s'était arrêté tant que la page reste ouverte.
- **Formulaires** (entrée, commentaire…) envoyés sans réseau : un message « Connexion interrompue » s'affiche et tout ce qui a été saisi reste en place.
- **Erreur du serveur** : le message le dit, au lieu de parler de coupure, et invite à recharger la page pour vérifier si l'action a été enregistrée.
- **Refus du serveur** (lieu manquant, par exemple) : le formulaire reste tel qu'il a été rempli.

### Tester depuis un téléphone

Avec `npm run dev`, le site est accessible depuis un téléphone connecté au même réseau Wi-Fi :

1. Trouver l'adresse de l'ordinateur sur le réseau local (`ipconfig` sous Windows, ligne « Adresse IPv4 », par exemple `192.168.1.20`).
2. L'indiquer dans `.env` : `DEV_ALLOWED_ORIGINS=192.168.1.20`, puis relancer `npm run dev`.
3. Sur le téléphone, ouvrir `http://192.168.1.20:3000/access/<ACCESS_TOKEN>`.

Si le téléphone n'atteint pas le site, le pare-feu de l'ordinateur bloque probablement Node.js : l'autoriser sur les réseaux privés. Dans ce mode (`http` sans `localhost`), « Copier » et « Centrer sur ma position » ne fonctionnent pas : ils exigent `https`.

## Sécurité et confidentialité

### Accès

- Lien secret aléatoire, vérifié avant tout le reste sur chaque requête (`src/proxy.ts`). Le cookie d'accès est dérivé du token sans le contenir.
- Mots de passe hachés avec argon2id ; refus des mots de passe trop courants, vérifié localement (aucun appel externe). Un mot de passe temporaire n'est jamais stocké en clair.
- Sessions par cookie `httpOnly`, `sameSite=lax`, et `Secure` avec le préfixe `__Host-` dès que `APP_URL` est en `https`. Seule une empreinte du jeton de session est stockée en base. Changer ou réinitialiser un mot de passe ferme toutes les sessions du compte.
- Anti brute force : 5 échecs en 15 minutes bloquent l'identifiant pendant 15 minutes ; 20 échecs bloquent l'adresse IP (derrière un reverse proxy avec `TRUST_PROXY=true`).
- Protection CSRF : toute requête de modification doit venir du site lui-même (en-tête `Origin` égal à `APP_URL` en production).

### Données et contenu

- Toutes les saisies sont validées côté serveur. Les textes sont affichés comme du texte ; le seul balisage interprété est le gras et les liens `http`/`https` des entrées.
- Les fichiers ne sont jamais servis par une adresse publique : `/api/media/<identifiant aléatoire>` applique les mêmes règles que la page de l'entrée, et répond 404 dans tous les autres cas. Le type d'un fichier est déterminé par son contenu, jamais par son nom.
- Un voyage masqué, un brouillon ou une entrée retirée ne fuient nulle part : listes, carte, notifications, adresses directes et fichiers répondent comme s'ils n'existaient pas.

### En-têtes

- **Content-Security-Policy**, avec un jeton (« nonce ») différent à chaque requête : seuls les scripts du site s'exécutent, et le navigateur ne peut contacter aucun autre serveur que le site, à l'exception des fonds de carte OpenStreetMap.
- **Anti-indexation** : `X-Robots-Tag: noindex, nofollow` sur toutes les réponses, balise meta `noindex`, `robots.txt` qui interdit tout. Pas de sitemap ni de métadonnées de partage (Open Graph).
- **Autres** : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (seule la localisation est permise, pour la carte), `Cross-Origin-Opener-Policy`, et `Strict-Transport-Security` en production `https`.

### Données envoyées à l'extérieur

- **Fonds de carte** : c'est le seul appel vers un tiers. OpenStreetMap reçoit la zone affichée et le nom de domaine du site, jamais l'adresse de la page.
- **Télémétrie de Next.js** : désactivée.
- **Registre npm** : en développement et à la compilation, Next.js l'interroge pour connaître sa dernière version, sans transmettre aucune donnée du site.
- **En production**, le serveur n'émet aucune requête vers l'extérieur.

## Mise en production

Le site a besoin d'un serveur qui tourne en continu, avec un disque persistant pour la base et les fichiers : un VPS ou un NAS convient, une plateforme « serverless » non.

1. **Préparer le serveur** : Node.js 22.12 ou plus récent. Les dossiers de `DATABASE_PATH` et `MEDIA_DIR` doivent être sur un disque persistant et sauvegardé.
2. **Configurer** les variables d'environnement, notamment `APP_URL` en `https` et `TRUST_PROXY=true`.
3. **Installer et compiler**

   ```bash
   npm ci
   npm run build
   ```

4. **Créer le superuser** : `npm run create-superuser`.
5. **Démarrer** : `npm start`, sur le port de la variable `PORT` (3000 par défaut). Les migrations de la base s'appliquent automatiquement au démarrage. Utiliser un gestionnaire de processus (systemd, pm2…) pour un redémarrage automatique.

Le reverse proxy (nginx, Caddy…) doit :

- **servir le site en `https`** : les cookies sont alors marqués `Secure` ;
- **transmettre l'hôte d'origine** (`Host` ou `X-Forwarded-Host`) : la protection des formulaires compare l'origine de la requête à l'adresse publique ;
- **ajouter l'adresse du visiteur à `X-Forwarded-For`**, et être le seul intermédiaire (`TRUST_PROXY` lit la dernière adresse de la liste) ;
- **accepter des requêtes d'au moins 10 Mo** : les fichiers arrivent par morceaux de 4 Mo, 8 Mo au maximum par requête ;
- **laisser au moins 3 minutes** à une requête d'envoi sur une connexion lente.

Exemple pour nginx :

```nginx
server {
    listen 443 ssl;
    server_name journal.example.org;
    # ssl_certificate ... ;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
```

Les fonds de carte viennent des serveurs publics d'OpenStreetMap, dont les conditions d'utilisation conviennent à un petit site privé.

## Sauvegardes

```bash
npm run backup -- /chemin/vers/dossier
```

Crée une copie cohérente de la base, même pendant que le site tourne (`rjaroundtheworld-AAAAMMJJ-HHMMSS.db`, dans `./backups` par défaut). Les photos et vidéos ne sont pas incluses : copier aussi le dossier `MEDIA_DIR`. Pour restaurer, arrêter le site, remettre la copie à l'emplacement `DATABASE_PATH` et le dossier des médias à l'emplacement `MEDIA_DIR`, puis redémarrer.

## Développement

### Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (http://localhost:3000). Après de gros changements de code, le relancer. |
| `npm run build` puis `npm start` | Version de production. |
| `npm test` | Tests automatisés. |
| `npm run typecheck` | Vérification des types TypeScript. |
| `npm run create-superuser` | Création du superuser, ou nouveau mot de passe. |
| `npm run backup` | Sauvegarde de la base. |
| `npm run db:migrate` | Applique les migrations (fait aussi automatiquement au démarrage). |
| `npm run db:generate -- --name description` | Génère une migration après une modification de `src/server/db/schema.ts`. |

### Choix techniques

- **Next.js** (App Router) et TypeScript. Les modifications passent par des Server Actions, les fichiers par des routes d'API.
- **SQLite** avec **Drizzle ORM** : léger, sans moteur binaire ni client généré, et des migrations SQL lisibles dans `drizzle/`.
- **sharp** pour les photos, **Leaflet** pour la carte, **argon2id** pour les mots de passe.
- **Logique métier dans des services** (`src/server/services/`), qui appliquent tous la matrice de permissions ; les actions et les routes ne font que les appeler.

### Tests

Les tests (Vitest) utilisent une base SQLite en mémoire avec les vraies migrations, et un dossier temporaire pour les fichiers. Ils couvrent en priorité :

- **les permissions** : la matrice entière, compte par compte ;
- **l'authentification** : lien secret, sessions, mots de passe, anti brute force, CSRF ;
- **la visibilité** : voyages masqués, brouillons, carte ;
- **l'accès aux médias** : envoi par morceaux, quotas, formats, droits ;
- **les commentaires et réactions** ;
- **les notifications** : destinataires, doublons, visibilité ;
- **la sécurité** : rendu du texte contre le XSS, en-têtes.

### Structure

```
drizzle/                  migrations SQL
scripts/                  scripts en ligne de commande (superuser, sauvegarde, migrations)
src/proxy.ts              contrôle d'accès et en-têtes appliqués à chaque requête
src/app/                  pages (Next.js App Router)
src/app/api/              routes d'envoi et de lecture des médias
src/components/           composants d'interface (map/ : carte et choix du lieu)
src/lib/                  code partagé : configuration, textes, dates, rendu du texte
src/server/permissions.ts matrice de permissions (source unique)
src/server/services/      logique métier, couverte par les tests
src/server/actions/       actions de formulaire (couche fine)
src/server/auth/          lien secret, sessions, mots de passe, anti brute force, CSP
src/server/media/         fichiers : envoi par morceaux, traitement des photos, stockage
src/server/db/            schéma et connexion à la base
tests/                    tests automatisés
```

## Limites connues

- **Photos HEIC non prises en charge.** L'iPhone convertit normalement en JPEG à l'envoi ; sinon, régler Appareil photo > Formats > « Le plus compatible ».
- **Vidéos ni converties ni compressées**, et sans miniature. Une vidéo iPhone en HEVC peut ne pas se lire dans certains navigateurs (même réglage conseillé).
- **Envoi interrompu** : il ne peut pas être repris après fermeture ou rechargement de la page. Les fichiers temporaires abandonnés sont nettoyés au bout de 24 heures.
- **Doublon possible** : si la réponse du serveur se perd juste après l'envoi d'une petite photo, celle-ci peut apparaître en double ; il suffit de supprimer le doublon.
- **Ordre des photos** : elles restent dans l'ordre d'ajout.
- **Indicateur de chargement** : aucun pendant le passage d'une page à l'autre. Un tel indicateur ferait répondre « 200 » au lieu de « 404 » pour un voyage masqué.
- **Anti brute force** : il peut bloquer pendant 15 minutes un identifiant visé par quelqu'un qui essaie des mots de passe. Le superuser lève le blocage en réinitialisant le mot de passe.

## Phase 2

Pistes prévues, non développées. Rien dans la Phase 1 ne les empêche :

- **Mode hors ligne partiel** ou brouillon conservé sur le téléphone si la connexion saute.
- **Application installable (PWA)** : les en-têtes l'autorisent déjà.
- **Transcodage des vidéos** et compression plus poussée, par exemple pour lire les vidéos HEVC partout.
- **Lieu tiré des coordonnées GPS des photos** : elles sont déjà enregistrées en base à l'envoi.
- **Export d'un voyage** en PDF ou en archive.
- **Carte globale**, tous voyages confondus.
- **Statistiques et recherche** dans le journal.
