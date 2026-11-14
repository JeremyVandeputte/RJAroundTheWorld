# RJ Around The World

Journal de voyage privé, pour raconter nos voyages à nos proches : entrées datées avec texte, photos, vidéos et lieu sur une carte, et notifications.

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
| `FFMPEG_PATH` | non | vide | Programme ffmpeg qui convertit les vidéos après l'envoi (voir « Photos et vidéos »). Vide : les vidéos restent telles qu'envoyées. |
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

Pas d'inscription libre : seuls le script `create-superuser` et la page « Administration » créent des comptes. Pour le superuser, cette page permet de :

- **créer un compte** : identifiant, nom affiché et permissions. Un mot de passe temporaire est généré et affiché une seule fois ; la personne doit choisir le sien dès sa première connexion ;
- **régler les permissions** de chaque compte : Publier et Gérer les voyages (désactivées par défaut : un nouveau compte peut seulement lire) ;
- **réinitialiser un mot de passe oublié** : nouveau mot de passe temporaire affiché une seule fois, sessions du compte fermées, blocage de connexion levé ;
- **forcer un changement de mot de passe** sans toucher au mot de passe actuel ;
- **désactiver ou réactiver** un compte : un compte désactivé est déconnecté partout et ne peut plus se connecter ;
- **supprimer** un compte. Un compte qui a écrit des entrées ne peut pas être supprimé : il faut le désactiver ;
- **gérer les tags** : en créer, les renommer (partout où ils sont utilisés) ou les supprimer (ils sont retirés des entrées) ;
- **choisir la photo du site** : affichée dans un rond à gauche de « RJ Around The World » en haut de chaque page (page de connexion comprise), comme icône de l'onglet du navigateur (découpée en rond, coins transparents) et en grand sur la page « À propos ». Elle est recadrée en carré au centre ; JPEG, PNG ou WebP, 8 Mo au maximum. « Retirer la photo » revient au nom seul et à l'icône « RJ ». L'icône de l'application installée sur un téléphone reste l'icône « RJ ».

Les comptes qui ont **à la fois Publier et Gérer les voyages** ont aussi accès à « Administration », mais seulement pour les tags et la photo du site : ni les comptes ni le lien secret ne leur sont montrés.

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
| Créer un voyage | si Gérer les voyages | oui |
| Modifier, masquer ou supprimer un voyage | les siens, si Gérer les voyages | oui |
| Gérer les comptes | non | oui |
| Statistiques, archive ZIP d'un voyage, tags et photo du site (administration) | si Publier et Gérer les voyages | oui |

Sans compte, rien n'est accessible : seule la page de connexion répond.

Tout ce qui concerne les entrées ne vaut que dans les voyages que la personne peut voir. Les deux permissions sont indépendantes : pour préparer un voyage masqué et y écrire, il faut Gérer les voyages (pour le créer) et Publier (pour y écrire). Un compte désactivé, ou qui doit d'abord changer son mot de passe, n'a accès à rien d'autre que sa page de profil.

### Voyages

- « Nouveau voyage » sur l'accueil (superuser et comptes ayant Gérer les voyages). Le compte qui crée un voyage en est l'auteur.
- Un voyage est toujours créé **non visible** ; sa page de modification s'ouvre alors sur sa **miniature**.
- **Miniature du voyage** : une photo envoyée pour le voyage, ou une des photos de ses entrées. Elle s'affiche sur l'accueil et en tête du journal. **Elle est obligatoire pour rendre le voyage visible** ; un voyage déjà visible qui perd sa miniature (photo supprimée) reste visible, avec un fond neutre.
- Tant qu'un voyage est non visible, lui et ses entrées, même publiées, n'existent que pour son auteur et le superuser : pour tous les autres, ses adresses répondent 404, comme s'il n'existait pas. Cela vaut aussi pour quelqu'un qui y avait écrit avant qu'il ne soit masqué.
- Cocher « Voyage visible » le révèle d'un coup avec toutes ses entrées publiées.
- Seuls l'auteur du voyage (s'il a toujours Gérer les voyages) et le superuser peuvent le modifier, changer sa visibilité ou le supprimer. La suppression emporte toutes ses entrées, y compris celles écrites par d'autres, avec leurs photos et vidéos.
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
- **Tags** (facultatifs) : touchez les tags qui décrivent l'entrée (plage, randonnée…). Un tag absent de la liste se tape dans « Nouveau tag… » puis « Ajouter » ; il est créé à l'enregistrement. Deux noms qui ne diffèrent que par les majuscules ou les accents désignent le même tag. Sur la page de l'entrée, un tag mène au journal du voyage filtré sur ce tag.

### Exporter un voyage

Réservé aux comptes qui ont à la fois Publier et Gérer les voyages, et au superuser, pour les voyages qu'ils peuvent voir : les autres ne voient pas le lien. Sur la page du voyage, « Télécharger (ZIP) », dans le bandeau « Gestion du voyage », produit une archive `<voyage>.zip` contenant :

- `index.html` : tout le voyage sur une seule page, lisible hors ligne dans n'importe quel navigateur (miniature, entrées de la plus ancienne à la plus récente, texte, lieux, personnes, tags, photos et vidéos). Elle ne contacte aucun serveur ; les lieux sont des liens vers OpenStreetMap, ouverts seulement si on les touche. Pour un PDF, ouvrir cette page et choisir « Imprimer » puis « Enregistrer au format PDF » (les vidéos sont alors omises).
- `media/` : les photos et vidéos telles qu'elles sont stockées sur le site, avec des noms lisibles (`2026-11-11-plage-des-salines.jpg`).
- `journal.json` : le même contenu sous forme de données.

L'archive contient les entrées publiées (jamais les brouillons). L'archive est produite au fil du téléchargement, sans être construite d'abord sur le serveur ; les fichiers n'étant pas recompressés, elle pèse à peu près le poids des photos et vidéos du voyage. Au-delà de 4 Go, le format ZIP64 est utilisé (lu par Windows, macOS, Linux et 7-Zip).

### Filtres

Le journal et la carte d'un voyage ont une barre « Filtrer par jour ou par tag », qui ouvre un panneau ; une pastille y indique le nombre de filtres actifs.

- **Jour** : des boutons, un par jour qui a des entrées (la ligne défile sur le côté pour un long voyage), plus « Tous les jours ».
- **Tags** : un ou plusieurs ; une entrée est gardée si elle a au moins un des tags choisis.
- Les filtres s'appliquent dès qu'on les touche, le panneau restant ouvert pour en choisir plusieurs. Ils s'affichent dans l'adresse de la page (`?jour=2026-11-14&tags=plage,randonnee`) et passent du journal à la carte : une vue filtrée peut être rechargée ou envoyée à quelqu'un.
- Les filtres actifs apparaissent sous la barre, même panneau fermé : toucher l'un d'eux le retire ; « Tout effacer » revient à toutes les entrées.

### Photos et vidéos

Elles s'ajoutent depuis « Modifier l'entrée », section « Photos et vidéos ». Sur une nouvelle entrée, le bouton « Enregistrer le brouillon et ajouter des photos » y mène directement. Chaque fichier est enregistré dès qu'il est envoyé, sans attendre « Enregistrer ».

- **Photos** : JPEG, PNG ou WebP, 10 Mo maximum par défaut. Chaque photo est redressée, réduite à 2000 px sur le grand côté et convertie en JPEG, avec une miniature de 480 px. L'original n'est pas conservé.
- **Vie privée** : les photos enregistrées ne contiennent plus aucune métadonnée (position GPS, modèle d'appareil). Leur position et leur date de prise de vue sont seulement notées en base, pour placer l'entrée sur la carte. Les vidéos ne perdent leurs métadonnées (dont la position GPS enregistrée par un téléphone) que si elles sont converties avec `FFMPEG_PATH` ; sinon elles restent telles qu'envoyées.
- **Vidéos** : MP4, MOV ou WebM, 300 Mo maximum par défaut, lues par le lecteur du navigateur. Sans `FFMPEG_PATH`, elles sont enregistrées telles quelles.
- **Conversion des vidéos** (si `FFMPEG_PATH` désigne le programme ffmpeg) : après l'envoi, chaque vidéo est convertie en MP4 H.264/AAC, lisible partout (une vidéo iPhone en HEVC ne l'est pas), réduite à 1920 px sur le grand côté (1080p), qualité CRF 26, sans métadonnées (un téléphone y enregistre la position GPS) et prête à être lue avant d'être entièrement chargée. La conversion se fait en arrière-plan, une vidéo à la fois : l'envoi n'attend pas, et la vidéo d'origine est lue en attendant. Elle reprend après un redémarrage du serveur. Si elle échoue, l'original est gardé et la raison est écrite dans les journaux du serveur. Compter de l'ordre d'une à quelques minutes par vidéo selon la machine.
- **Quota** : 30 Go au total par défaut ; un envoi qui le dépasserait est refusé avant d'être reçu. 100 fichiers au maximum par entrée.
- **Affichage** : miniatures chargées au fil du défilement ; un appui ouvre la photo en grand.
- **Miniature d'une entrée** : la photo affichée dans la liste du voyage. Par défaut la première ; « Miniature » sous une autre photo la choisit à la place.
- **Stockage** : sur le disque, dans `MEDIA_DIR`, un dossier par entrée ; la base ne garde que le chemin et les métadonnées. Supprimer une entrée ou un voyage supprime ses fichiers.

### Carte

La carte utilise Leaflet (inclus dans le site, aucun CDN) et les fonds de carte d'OpenStreetMap : pas de clé API, pas de service payant.

- **Choisir un lieu** : dans le formulaire d'une entrée, un appui sur la carte place le lieu. « Ajouter une arrivée (point B) » place un second point pour un trajet à sens unique ; A et B sont reliés par un trait droit (aucun calcul d'itinéraire). Un marqueur se déplace en le faisant glisser ou en touchant ailleurs. Chaque point peut recevoir un nom.
- **Lieu tiré des photos** : quand des photos de l'entrée contiennent une position GPS, elles apparaissent en vignettes au-dessus de la carte (« Position des photos »), de la plus ancienne à la plus récente. Toucher une vignette place le point en cours (le lieu, ou le point B s'il est sélectionné) là où la photo a été prise. « Trajet de la première à la dernière photo » place A et B d'un coup. Les photos envoyées apparaissent aussitôt, sans recharger la page. Ces positions ne sont montrées qu'à qui peut modifier l'entrée ; les fichiers des photos restent servis sans aucune donnée GPS.
- **Centrer sur ma position** : n'apparaît qu'en `https` (ou sur `localhost`), car les navigateurs n'autorisent la localisation que sur une connexion sécurisée. Centre la carte, sans placer de point.
- **Carte du voyage** : bouton « Carte » sur la page du voyage. Un marqueur par lieu des entrées publiées ; un appui sur un marqueur ouvre l'entrée.
- **Carte de tous les voyages** : bouton « Carte de tous les voyages » sur l'accueil (`/map`). Tous les lieux des entrées publiées, une couleur par voyage (attribuées du plus ancien au plus récent, pour qu'un nouveau voyage ne change pas celles des autres ; elles se répètent au-delà de huit voyages). Les couleurs sont choisies pour rester distinctes pour les personnes daltoniennes, et chaque voyage est aussi nommé dans la légende et dans l'info-bulle de ses marqueurs. Un appui sur un marqueur ouvre l'entrée ; la légende sous la carte mène à la carte de chaque voyage. Mêmes règles que la carte d'un voyage : un voyage masqué n'y apparaît que pour son auteur et le superuser.
- **Page d'une entrée** : une petite carte montre son lieu ou son trajet.
- Les brouillons n'apparaissent jamais sur la carte, même pour leur auteur.

### À propos

Lien « À propos » en bas de chaque page (une fois connecté), page `/about` : la photo du site en grand, au centre, puis ce qu'est le site (le blog de nos voyages) et sa raison d'être (retrouver tous nos souvenirs de voyage au même endroit pour les reconsulter facilement). Le texte se modifie dans `src/app/(site)/about/page.tsx`.

### Recherche et statistiques

- **Recherche** : champ en haut de l'accueil (page `/search`). Cherche dans les titres, les textes, les noms de lieux, les tags, le nom du voyage, l'auteur et les personnes identifiées. Majuscules et accents sont ignorés (« foret » trouve « Forêt ») et tous les mots doivent être présents. Les mots trouvés sont surlignés, avec un extrait du texte. Les 50 entrées les plus récentes sont affichées. On ne trouve que ce que l'on peut déjà voir : entrées publiées des voyages visibles, plus ses propres brouillons (le superuser voit tout).
- **Statistiques** : bouton « Statistiques » sur l'accueil (page `/stats`). Nombre de voyages, d'entrées, de jours racontés, de photos et de vidéos, longueur des trajets A → B (à vol d'oiseau), un tableau par voyage, les tags les plus utilisés, les personnes les plus présentes et qui écrit le plus. Réservées aux comptes qui ont à la fois Publier et Gérer les voyages, et au superuser (les autres ne voient pas le bouton). Seules les entrées publiées des voyages que l'on peut voir sont comptées.

### Notifications

La cloche de l'en-tête indique le nombre de notifications non lues et mène à la page « Notifications ». Ni temps réel ni e-mail : elles apparaissent au chargement d'une page.

| Événement | Qui est notifié |
|---|---|
| Première publication d'une entrée | Toutes les personnes qui peuvent la voir, sauf son auteur ; mention « Vous apparaissez dans cette entrée » pour les personnes identifiées |
| Personne identifiée après la publication (ou pendant que l'entrée était retirée) | Cette personne, une seule fois |
| Voyage rendu visible (ou créé directement visible) | Toutes les personnes qui peuvent désormais le voir, une seule fois par voyage |

- Jamais à soi-même, et rien sur un voyage masqué pour qui n'y a pas accès.
- Pas de doublon : retirer puis republier une entrée ne renotifie pas.
- Une notification disparaît si son objet n'est plus visible (voyage masqué, entrée retirée, personne retirée de l'entrée) et réapparaît s'il le redevient.
- Toucher une notification mène à l'entrée ou au voyage concerné et la marque comme lue. « Marquer comme lue » et « Tout marquer comme lu » marquent sans quitter la page. Les 100 plus récentes sont affichées.

### Connexion instable

- **Envoi de photos et vidéos** : par morceaux de 4 Mo. Après une coupure courte, le morceau en cours est renvoyé automatiquement (4 nouvelles tentatives). Après une coupure plus longue, l'envoi s'arrête avec un message, et « Reprendre l'envoi » repart d'où il s'était arrêté tant que la page reste ouverte.
- **Formulaires** (entrée, voyage…) envoyés sans réseau : un message « Connexion interrompue » s'affiche et tout ce qui a été saisi reste en place.
- **Brouillon local d'une entrée** : pendant la rédaction (nouvelle entrée ou modification), ce qui est saisi est copié toutes les 2 secondes dans le navigateur de l'appareil, ainsi qu'au moment où l'on quitte l'application ou la page. Si la page est fermée, rechargée ou perdue avant l'enregistrement, la rouvrir affiche « Des modifications non enregistrées du … ont été retrouvées sur cet appareil », avec **Reprendre ces modifications** ou **Les ignorer**. Sont conservés : date, titre, texte, personnes, tags (y compris les nouveaux) et lieu ; pas les photos, qui s'envoient séparément. La copie est supprimée dès que l'entrée est enregistrée, et n'est pas proposée si elle est identique à ce qui est enregistré. Elle est propre à chaque compte, voyage et entrée, et ne quitte jamais l'appareil.
- **Page ouverte sans connexion** : une page « Pas de connexion » remplace l'erreur du navigateur (voir « Installer l'application »).
- **Erreur du serveur** : le message le dit, au lieu de parler de coupure, et invite à recharger la page pour vérifier si l'action a été enregistrée.
- **Refus du serveur** (lieu manquant, par exemple) : le formulaire reste tel qu'il a été rempli.

### Installer l'application

Le site s'installe sur l'écran d'accueil d'un téléphone et s'ouvre alors en plein écran, comme une application, avec l'icône « RJ ». Il faut l'avoir ouvert une fois avec le lien secret, et être en `https` (en production) : les navigateurs ne proposent pas l'installation en `http`, sauf sur `localhost`.

- **Android (Chrome)** : menu ⋮ > « Installer l'application » (ou « Ajouter à l'écran d'accueil »).
- **iPhone (Safari)** : bouton Partager > « Sur l'écran d'accueil ».

L'application démarre toujours par le lien secret, qui mène aussitôt à l'accueil : elle reçoit donc le cookie d'accès même quand elle ne partage pas les cookies du navigateur (cas de l'iPhone, où il faut alors se connecter une fois dans l'application). Le lien figure pour cela dans le manifeste de l'application, qui n'est lisible qu'avec le cookie du lien secret. Si `ACCESS_TOKEN` change, il faut réinstaller l'application.

Si une page est ouverte sans aucune connexion, une page « Pas de connexion » s'affiche à la place de l'erreur du navigateur, avec « Réessayer ». Aucune page ni photo n'est gardée en cache sur l'appareil.

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
- Le service worker (`public/sw.js`), qui affiche la page « Pas de connexion », ne met rien en cache : pages, photos et vidéos viennent toujours du serveur, avec les mêmes contrôles d'accès. Le manifeste, les icônes et le service worker ne sont servis qu'avec le cookie du lien secret.
- Le brouillon local d'une entrée reste dans le navigateur de l'appareil (`localStorage`) jusqu'à l'enregistrement ou « Les ignorer » ; il n'est pas effacé à la déconnexion. Sur un appareil partagé, enregistrer ou ignorer ses brouillons avant de le prêter.
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

1. **Préparer le serveur** : Node.js 22.12 ou plus récent ; ffmpeg en option pour convertir les vidéos (`apt install ffmpeg` sur Debian/Ubuntu, puis `FFMPEG_PATH=/usr/bin/ffmpeg`). Les dossiers de `DATABASE_PATH` et `MEDIA_DIR` doivent être sur un disque persistant et sauvegardé.
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
| `npm run icons` | Régénère les icônes de l'application à partir du dessin de `scripts/generate-icons.ts`. |
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
- **les notifications** : destinataires, doublons, visibilité ;
- **la sécurité** : rendu du texte contre le XSS, en-têtes.

### Structure

```
drizzle/                  migrations SQL
scripts/                  scripts en ligne de commande (superuser, sauvegarde, migrations, icônes)
public/                   icônes de l'application et service worker (sw.js)
src/proxy.ts              contrôle d'accès et en-têtes appliqués à chaque requête
src/app/                  pages (Next.js App Router), manifeste (app.webmanifest/)
src/app/api/              routes d'envoi et de lecture des médias
src/components/           composants d'interface (map/ : carte et choix du lieu)
src/lib/                  code partagé : configuration, textes, dates, rendu du texte
src/server/permissions.ts matrice de permissions (source unique)
src/server/services/      logique métier, couverte par les tests
src/server/actions/       actions de formulaire (couche fine)
src/server/auth/          lien secret, sessions, mots de passe, anti brute force, CSP
src/server/media/         fichiers : envoi par morceaux, traitement des photos, stockage
src/server/export/        export d'un voyage (archive ZIP écrite au fil de l'envoi)
src/server/db/            schéma et connexion à la base
tests/                    tests automatisés
```

## Limites connues

- **Photos HEIC non prises en charge.** L'iPhone convertit normalement en JPEG à l'envoi ; sinon, régler Appareil photo > Formats > « Le plus compatible ».
- **Vidéos sans miniature**. Sans `FFMPEG_PATH`, elles ne sont ni converties ni compressées : une vidéo iPhone en HEVC peut alors ne pas se lire dans certains navigateurs (même réglage conseillé).
- **Envoi interrompu** : il ne peut pas être repris après fermeture ou rechargement de la page. Les fichiers temporaires abandonnés sont nettoyés au bout de 24 heures.
- **Doublon possible** : si la réponse du serveur se perd juste après l'envoi d'une petite photo, celle-ci peut apparaître en double ; il suffit de supprimer le doublon.
- **Ordre des photos** : elles restent dans l'ordre d'ajout.
- **Indicateur de chargement** : aucun pendant le passage d'une page à l'autre. Un tel indicateur ferait répondre « 200 » au lieu de « 404 » pour un voyage masqué.
- **Recherche** : elle parcourt les entrées à chaque requête, sans index. Largement assez rapide pour quelques milliers d'entrées ; au-delà, un index plein texte (FTS5 de SQLite) serait à ajouter.
- **Anti brute force** : il peut bloquer pendant 15 minutes un identifiant visé par quelqu'un qui essaie des mots de passe. Le superuser lève le blocage en réinitialisant le mot de passe.

## Phase 2

Réalisé :

- **Brouillon local** d'une entrée en cours de rédaction (voir « Connexion instable »).
- **Application installable (PWA)**, avec une page « Pas de connexion » (voir « Installer l'application »).
- **Lieu tiré des coordonnées GPS des photos** (voir « Carte »).
- **Carte de tous les voyages** (voir « Carte »).
- **Recherche et statistiques** (voir « Recherche et statistiques »).
- **Export d'un voyage** en archive ZIP, avec une page lisible hors ligne et imprimable en PDF (voir « Exporter un voyage »).
- **Conversion des vidéos** avec ffmpeg, optionnelle (voir « Photos et vidéos »).

Toutes les pistes prévues sont réalisées.
