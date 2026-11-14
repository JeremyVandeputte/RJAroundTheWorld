# Mise en production sur un VPS

Guide pas à pas pour installer RJ Around The World sur un VPS, de la commande du serveur jusqu'aux mises à jour. Il suppose un VPS sous **Ubuntu 24.04 LTS** (Debian 12 marche de la même façon) et un nom de domaine dont vous gérez les DNS.

Dans tout le guide, remplacez :

| Valeur d'exemple | À remplacer par |
|---|---|
| `journal.exemple.fr` | le nom de domaine du site |
| `203.0.113.10` | l'adresse IPv4 du VPS |
| `rjatw` | le nom du compte Linux qui fera tourner le site (vous pouvez le garder) |

Les commandes précédées de `$` se lancent sur **votre PC**, celles précédées de `#` sur le **VPS en root** (ou avec `sudo`), celles précédées de `rjatw$` sur le **VPS avec le compte `rjatw`**. Ne tapez pas le `$` ou le `#`.

## Vue d'ensemble

```
Navigateur ──https──▶ Caddy (ports 80/443, certificat HTTPS automatique)
                         │
                         ▼ http://127.0.0.1:3000 (invisible de l'extérieur)
                      Next.js (npm start), lancé par systemd
                         │
                         ├── /var/lib/rjaroundtheworld/rjaroundtheworld.db   (base SQLite)
                         └── /var/lib/rjaroundtheworld/media/                 (photos, vidéos)
```

- Le **code** vit dans `/home/rjatw/app` ; les **données** dans `/var/lib/rjaroundtheworld`. Les séparer permet de mettre à jour le code sans jamais toucher aux données.
- **Caddy** sert le site en HTTPS et obtient tout seul le certificat Let's Encrypt. Une variante nginx est donnée en annexe.
- **systemd** démarre le site au boot et le relance s'il s'arrête.

Durée totale : environ une heure la première fois.

---

## 1. Choisir et commander le VPS

- **Système** : Ubuntu 24.04 LTS (ou Debian 12), en 64 bits (x86-64 ou ARM64 : les deux marchent, les modules natifs du projet ont des versions précompilées pour les deux).
- **Mémoire** : 2 Go conseillés. Avec 1 Go, la compilation (`npm run build`) peut manquer de mémoire : ajoutez alors un fichier d'échange (étape 3.4).
- **Disque** : la taille des photos et vidéos prévue (le quota par défaut est de 30 Go, réglable avec `MEDIA_QUOTA_GB`) + 10 Go pour le système, le code et les sauvegardes locales.
- **Processeur** : 1 ou 2 cœurs suffisent. Si vous activez la conversion des vidéos (ffmpeg), plus il y a de cœurs, plus elle est rapide.

Notez l'adresse IP du VPS et le mot de passe (ou la clé SSH) fournis par l'hébergeur.

## 2. Faire pointer le domaine vers le VPS

Chez le gestionnaire du nom de domaine, créez :

| Type | Nom | Valeur |
|---|---|---|
| `A` | `journal` (ou `@` pour le domaine nu) | `203.0.113.10` |
| `AAAA` | idem | l'adresse IPv6 du VPS, **seulement si** il en a une |

Vérifiez depuis votre PC (la propagation peut prendre de quelques minutes à quelques heures) :

```bash
$ nslookup journal.exemple.fr
```

L'adresse affichée doit être celle du VPS. **Ne passez pas à l'étape 7 (Caddy) avant que ce soit le cas** : Let's Encrypt doit pouvoir joindre le VPS par ce nom pour délivrer le certificat.

## 3. Préparer le serveur

### 3.1 Première connexion et mises à jour

```bash
$ ssh root@203.0.113.10
# apt update && apt full-upgrade -y
# timedatectl set-timezone Europe/Paris
```

Le fuseau horaire sert aux noms des sauvegardes et aux journaux ; le site, lui, affiche les heures dans le fuseau de chaque visiteur.

### 3.2 Compte dédié au site

Le site ne doit pas tourner en root.

```bash
# adduser --disabled-password --gecos "" rjatw
# mkdir -p /var/lib/rjaroundtheworld/media /var/backups/rjaroundtheworld
# chown -R rjatw:rjatw /var/lib/rjaroundtheworld /var/backups/rjaroundtheworld
# chmod 750 /var/lib/rjaroundtheworld
```

### 3.3 Pare-feu

Seuls SSH, HTTP et HTTPS doivent être ouverts ; le port 3000 du site reste fermé de l'extérieur.

```bash
# apt install -y ufw
# ufw allow OpenSSH
# ufw allow 80/tcp
# ufw allow 443/tcp
# ufw enable
# ufw status
```

Vérifiez bien que `OpenSSH` est autorisé **avant** `ufw enable`, sinon vous perdez l'accès au serveur.

Conseillé aussi : connexion SSH par clé plutôt que par mot de passe, et mises à jour de sécurité automatiques (`apt install -y unattended-upgrades`).

### 3.4 Fichier d'échange (si le VPS a 1 Go de mémoire ou moins)

```bash
# fallocate -l 2G /swapfile
# chmod 600 /swapfile
# mkswap /swapfile && swapon /swapfile
# echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 3.5 Node.js 22, git et ffmpeg

Le projet demande Node.js 22.12 ou plus récent. La version d'Ubuntu est trop ancienne : installez celle de NodeSource.

```bash
# apt install -y curl git ca-certificates
# curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
# apt install -y nodejs
# node -v        # doit afficher v22.x
# npm -v
```

Optionnel, pour convertir les vidéos (fortement conseillé si des vidéos d'iPhone sont envoyées : sans conversion, elles ne se lisent pas dans tous les navigateurs) :

```bash
# apt install -y ffmpeg
# which ffmpeg   # en principe /usr/bin/ffmpeg
```

## 4. Envoyer le code sur le VPS

Le projet n'a pas de dépôt distant pour l'instant. Le plus simple, sans passer par un service tiers, est de faire du VPS lui-même le dépôt distant, par SSH.

### 4.1 Donner à votre PC l'accès SSH au compte `rjatw`

Sur votre PC, si vous n'avez pas encore de clé SSH :

```bash
$ ssh-keygen -t ed25519
```

Puis copiez la clé publique (`C:\Users\<vous>\.ssh\id_ed25519.pub`) dans le compte `rjatw` :

```bash
# mkdir -p /home/rjatw/.ssh
# nano /home/rjatw/.ssh/authorized_keys      # coller la ligne de id_ed25519.pub, enregistrer
# chown -R rjatw:rjatw /home/rjatw/.ssh
# chmod 700 /home/rjatw/.ssh && chmod 600 /home/rjatw/.ssh/authorized_keys
```

Test depuis votre PC : `ssh rjatw@203.0.113.10` doit ouvrir une session sans mot de passe.

### 4.2 Créer le dépôt sur le VPS et y pousser le code

Sur le VPS, en `rjatw` :

```bash
rjatw$ git init --bare --initial-branch=main ~/rjaroundtheworld.git
```

Sur votre PC, dans le dossier du projet :

```bash
$ git remote add vps rjatw@203.0.113.10:rjaroundtheworld.git
$ git push vps main
```

Sur le VPS, récupérez une copie de travail :

```bash
rjatw$ git clone ~/rjaroundtheworld.git ~/app
rjatw$ cd ~/app && git log --oneline -1    # le dernier commit doit apparaître
```

Seul le code part : `.env`, `data/` et `node_modules/` sont exclus par `.gitignore`, ce qui est voulu.

Alternative : un dépôt **privé** sur GitHub ou GitLab, cloné sur le VPS. Ça marche aussi, mais le code transite alors par ce service.

## 5. Configurer le site (`.env`)

### 5.1 Générer les deux secrets

Sur le VPS, lancez deux fois cette commande et gardez les deux résultats (différents) :

```bash
rjatw$ node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

- le premier sera `SESSION_SECRET` ;
- le second sera `ACCESS_TOKEN`, la partie secrète du lien d'accès.

**Ne réutilisez pas les secrets de votre `.env` local** : ceux de la production ne doivent exister que sur le serveur (et dans votre gestionnaire de mots de passe).

### 5.2 Écrire le fichier `.env`

```bash
rjatw$ cd ~/app
rjatw$ cp .env.example .env
rjatw$ chmod 600 .env
rjatw$ nano .env
```

Contenu à mettre (en remplaçant les valeurs entre `<…>`) :

```bash
SESSION_SECRET=<premier secret>
ACCESS_TOKEN=<second secret>

APP_URL=https://journal.exemple.fr

DATABASE_PATH=/var/lib/rjaroundtheworld/rjaroundtheworld.db
MEDIA_DIR=/var/lib/rjaroundtheworld/media

MAX_PHOTO_MB=10
MAX_VIDEO_MB=300
MEDIA_QUOTA_GB=30

# Laisser vide pour ne pas convertir les vidéos.
FFMPEG_PATH=/usr/bin/ffmpeg

SESSION_DAYS=30

# Caddy (ou nginx) est devant le site : il transmet l'adresse des visiteurs.
TRUST_PROXY=true

# Inutile en production.
DEV_ALLOWED_ORIGINS=
```

Points d'attention :

- **`APP_URL`** doit être exactement l'adresse tapée dans le navigateur : `https://`, le bon nom, **sans `/` final** et sans port. Le site s'en sert pour vérifier que les formulaires viennent bien de lui ; une différence (http au lieu de https, `www.` en trop…) fait refuser toutes les actions avec une erreur 403.
- **`NODE_ENV`** ne se met pas dans `.env` : le service systemd s'en charge (étape 8).
- Le site refuse de démarrer si une variable est invalide et dit laquelle, sans afficher sa valeur.

## 6. Installer, compiler, créer le superuser

```bash
rjatw$ cd ~/app
rjatw$ npm ci
rjatw$ npm run build
```

- `npm ci` installe exactement les versions du `package-lock.json`. Les modules natifs (base SQLite, traitement des photos, mots de passe) arrivent précompilés : aucun compilateur n'est nécessaire. S'il réclame `python` ou `make`, c'est que le système n'est pas un Linux 64 bits standard (voir « Dépannage »).
- `npm run build` prend une à quelques minutes. Il doit se terminer par la liste des pages, sans erreur.

Créez la base et le compte administrateur (la base est créée à cette occasion) :

```bash
rjatw$ npm run create-superuser
```

`create-superuser` demande l'identifiant, le nom affiché et le mot de passe (10 caractères minimum, refusé s'il est trop courant). Notez-les dans votre gestionnaire de mots de passe.

Vérifiez que les fichiers sont bien au bon endroit :

```bash
rjatw$ ls -la /var/lib/rjaroundtheworld/
```

`rjaroundtheworld.db` doit y apparaître.

## 7. HTTPS avec Caddy

### 7.1 Installer Caddy

```bash
# apt install -y debian-keyring debian-archive-keyring apt-transport-https
# curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
# curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
# apt update && apt install -y caddy
```

### 7.2 Configurer Caddy

```bash
# nano /etc/caddy/Caddyfile
```

Remplacez tout le contenu par :

```caddy
journal.exemple.fr {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

C'est tout :

- Caddy obtient et renouvelle seul le certificat HTTPS, et redirige `http://` vers `https://` ;
- il transmet le nom d'hôte d'origine et ajoute l'adresse du visiteur à `X-Forwarded-For`, comme le site l'attend avec `TRUST_PROXY=true` ;
- il n'impose pas de limite de taille aux requêtes ni de délai trop court, donc les envois de photos et vidéos (par morceaux de 4 Mo) passent sans réglage.

Ne mettez pas de CDN ou de second proxy (Cloudflare en mode proxy, par exemple) devant Caddy : l'anti brute force lit la dernière adresse de `X-Forwarded-For`, qui doit être celle ajoutée par Caddy.

```bash
# systemctl reload caddy
# systemctl status caddy        # "active (running)"
```

Le site lui-même n'est pas encore démarré : à ce stade, `https://journal.exemple.fr` répond une erreur 502, c'est normal.

## 8. Démarrer le site avec systemd

### 8.1 Créer le service

```bash
# nano /etc/systemd/system/rjaroundtheworld.service
```

```ini
[Unit]
Description=RJ Around The World
After=network.target

[Service]
Type=simple
User=rjatw
Group=rjatw
WorkingDirectory=/home/rjatw/app
Environment=NODE_ENV=production
# Écoute seulement en local : seul Caddy peut joindre le site.
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=on-failure
RestartSec=5
# Les envois en cours ont le temps de se terminer lors d'un redémarrage.
TimeoutStopSec=30

# Durcissement : le site ne peut écrire que dans ses données.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/var/lib/rjaroundtheworld /home/rjatw/app/.next

[Install]
WantedBy=multi-user.target
```

### 8.2 Démarrer et activer au boot

```bash
# systemctl daemon-reload
# systemctl enable --now rjaroundtheworld
# systemctl status rjaroundtheworld
```

Le statut doit être `active (running)`. Les journaux du site :

```bash
# journalctl -u rjaroundtheworld -f        # Ctrl+C pour quitter
```

Au démarrage, les migrations de la base s'appliquent automatiquement ; une variable de configuration invalide y est signalée clairement.

## 9. Vérifier que tout marche

Depuis votre PC :

1. **Sans le lien secret, rien n'est visible** : `https://journal.exemple.fr` doit répondre « Not Found » (c'est voulu), et `https://journal.exemple.fr/robots.txt` doit interdire l'indexation.
2. **Le lien secret** : ouvrez `https://journal.exemple.fr/access/<ACCESS_TOKEN>`. Il mène à la page de connexion.
3. **Connexion** avec le superuser créé à l'étape 6.
4. **Administration** : le lien secret complet y est affiché, avec un bouton pour le copier. C'est lui qu'il faudra envoyer (en privé) à la famille.
5. **Premier essai complet** :
   - créer un voyage, lui donner une miniature, le rendre visible ;
   - écrire une entrée avec un lieu et une personne identifiée, envoyer une photo et une vidéo depuis un téléphone (en 4G de préférence, pour tester une vraie connexion mobile) ;
   - si ffmpeg est activé : après quelques minutes, la vidéo doit se lire partout ; sinon, `journalctl -u rjaroundtheworld` indique pourquoi la conversion a échoué ;
   - choisir la photo du site dans Administration ;
   - créer un compte de test en lecture seule, s'y connecter depuis un autre navigateur, vérifier qu'il ne voit que ce qu'il doit voir.
6. **Sur téléphone** : ouvrir le lien secret, se connecter, puis « Installer l'application » (Android) ou « Sur l'écran d'accueil » (iPhone).

## 10. Reprendre les données de votre PC (optionnel)

Par défaut, la production démarre vide. Pour y reprendre ce que vous avez saisi en local :

1. Sur votre PC, faites une copie cohérente de la base :

   ```bash
   $ npm run backup -- ./transfert
   ```

2. Sur le VPS, arrêtez le site :

   ```bash
   # systemctl stop rjaroundtheworld
   ```

3. Depuis votre PC, envoyez la base et les médias :

   ```bash
   $ scp ./transfert/rjaroundtheworld-<date>.db rjatw@203.0.113.10:/var/lib/rjaroundtheworld/rjaroundtheworld.db
   $ scp -r ./data/media/. rjatw@203.0.113.10:/var/lib/rjaroundtheworld/media/
   ```

4. Sur le VPS, supprimez les éventuels fichiers `-wal` / `-shm` laissés par l'ancienne base, puis redémarrez :

   ```bash
   # rm -f /var/lib/rjaroundtheworld/rjaroundtheworld.db-wal /var/lib/rjaroundtheworld/rjaroundtheworld.db-shm
   # chown -R rjatw:rjatw /var/lib/rjaroundtheworld
   # systemctl start rjaroundtheworld
   ```

Les comptes et mots de passe locaux viennent avec la base. Si vous aviez créé des comptes de test, supprimez-les ensuite dans Administration.

## 11. Sauvegardes

Sans sauvegarde hors du VPS, une panne du disque ou une erreur fait tout perdre. Il faut copier **la base** et **le dossier des médias**.

### 11.1 Sauvegarde quotidienne sur le VPS

```bash
# nano /etc/cron.d/rjaroundtheworld
```

```cron
# Chaque nuit à 3 h : copie cohérente de la base (même site en marche), gardée 30 jours.
0 3 * * * rjatw cd /home/rjatw/app && npm run -s backup -- /var/backups/rjaroundtheworld >/dev/null && find /var/backups/rjaroundtheworld -name 'rjaroundtheworld-*.db' -mtime +30 -delete
```

Les photos et vidéos ne changent jamais une fois enregistrées : une copie incrémentale suffit (étape suivante).

### 11.2 Copie hors du VPS (indispensable)

Le plus simple : récupérer régulièrement sauvegardes et médias sur votre PC, ou sur un NAS, avec `rsync` (disponible sous Windows via WSL ou Git Bash avec rsync, ou en natif sur un NAS) :

```bash
$ rsync -av rjatw@203.0.113.10:/var/backups/rjaroundtheworld/ ./sauvegardes-rjatw/base/
$ rsync -av rjatw@203.0.113.10:/var/lib/rjaroundtheworld/media/ ./sauvegardes-rjatw/media/
```

Autres possibilités : les sauvegardes automatiques (« snapshots ») proposées par l'hébergeur, ou un outil comme `restic` vers un stockage externe. Dans tous les cas, **essayez une restauration une fois** pour être sûr que la sauvegarde est utilisable.

### 11.3 Restaurer

```bash
# systemctl stop rjaroundtheworld
# cp /var/backups/rjaroundtheworld/rjaroundtheworld-<date>.db /var/lib/rjaroundtheworld/rjaroundtheworld.db
# rm -f /var/lib/rjaroundtheworld/rjaroundtheworld.db-wal /var/lib/rjaroundtheworld/rjaroundtheworld.db-shm
# chown rjatw:rjatw /var/lib/rjaroundtheworld/rjaroundtheworld.db
# systemctl start rjaroundtheworld
```

Remettez aussi le dossier `media` s'il a été perdu.

## 12. Mettre à jour le site

À chaque nouvelle version, sur votre PC :

```bash
$ git push vps main
```

Puis sur le VPS :

```bash
rjatw$ cd ~/app
rjatw$ npm run backup -- /var/backups/rjaroundtheworld      # sauvegarde avant mise à jour
rjatw$ git pull
rjatw$ npm ci
rjatw$ npm run build
```

Puis, en root :

```bash
# systemctl restart rjaroundtheworld
# journalctl -u rjaroundtheworld -n 50
```

- Les migrations de la base s'appliquent toutes seules au redémarrage. La sauvegarde juste avant permet de revenir en arrière si besoin.
- Pendant `npm run build`, le site continue de tourner avec l'ancienne version ; il n'est indisponible que quelques secondes, au redémarrage.
- Si une nouvelle version ajoute une variable de configuration, elle est décrite dans le `README.md` et dans `.env.example` : comparez avec votre `.env` (`diff .env.example .env`).

Pour revenir à la version précédente : `git log --oneline` pour trouver le commit, `git checkout <commit>`, puis `npm ci`, `npm run build`, restauration de la sauvegarde de la base si une migration a eu lieu, et redémarrage.

## 13. Gestes courants

| Besoin | Commande |
|---|---|
| Voir si le site tourne | `systemctl status rjaroundtheworld` |
| Voir les journaux en direct | `journalctl -u rjaroundtheworld -f` |
| Redémarrer le site | `systemctl restart rjaroundtheworld` |
| Changer le mot de passe du superuser (oublié) | `cd /home/rjatw/app && sudo -u rjatw npm run create-superuser` |
| Sauvegarde immédiate | `cd /home/rjatw/app && sudo -u rjatw npm run backup -- /var/backups/rjaroundtheworld` |
| Place utilisée par les médias | `du -sh /var/lib/rjaroundtheworld/media` |
| Place libre sur le disque | `df -h /` |
| Recharger Caddy après modification | `systemctl reload caddy` |

Changer `ACCESS_TOKEN` dans `.env` (puis redémarrer) invalide l'ancien lien pour tout le monde : il faut renvoyer le nouveau lien à chacun, et réinstaller l'application sur les téléphones. Changer `SESSION_SECRET` déconnecte tout le monde.

## 14. Dépannage

| Symptôme | Cause probable et solution |
|---|---|
| Toutes les pages répondent « Not Found », même avec le lien | Le lien a été ouvert avec un autre `ACCESS_TOKEN`, ou dans un autre navigateur. Rouvrir `https://journal.exemple.fr/access/<ACCESS_TOKEN>` exactement. |
| Erreur 502 Bad Gateway | Le site ne tourne pas : `systemctl status rjaroundtheworld` et `journalctl -u rjaroundtheworld -n 50`. |
| Le site ne démarre pas, « Invalid environment configuration » | Une variable de `.env` est invalide ; le journal dit laquelle (souvent `APP_URL` en `http` ou un secret trop court). |
| Les formulaires répondent « Forbidden » (403) | `APP_URL` ne correspond pas exactement à l'adresse utilisée (https, `www.`, `/` final). |
| Pas de certificat HTTPS | Le DNS ne pointe pas encore vers le VPS, ou les ports 80/443 sont fermés (`ufw status`, pare-feu de l'hébergeur). Voir `journalctl -u caddy -n 50`. |
| `npm ci` cherche à compiler (`gyp`, `python`, `make`) | Système non standard (32 bits, Alpine/musl…). Utiliser Ubuntu ou Debian 64 bits. |
| `npm run build` s'arrête sans message ou « Killed » | Mémoire insuffisante : ajouter un fichier d'échange (étape 3.4). |
| Les vidéos ne se convertissent pas | `FFMPEG_PATH` vide ou incorrect (`which ffmpeg`), ou ffmpeg en erreur : la raison est dans `journalctl -u rjaroundtheworld`. L'original reste lisible en attendant. |
| Les envois de photos échouent toujours | Un proxy entre le visiteur et Caddy limite la taille des requêtes ; avec nginx, vérifier `client_max_body_size 10m` (annexe). |
| « Database is locked » dans les journaux | Deux copies du site tournent sur la même base (un `npm start` lancé à la main en plus du service). N'utiliser que le service systemd. |

## Annexe : nginx à la place de Caddy

Si vous préférez nginx (ou s'il est déjà installé sur le VPS) :

```bash
# apt install -y nginx certbot python3-certbot-nginx
# nano /etc/nginx/sites-available/rjaroundtheworld
```

```nginx
server {
    listen 80;
    server_name journal.exemple.fr;

    # Les fichiers arrivent par morceaux de 4 Mo (8 Mo au plus par requête).
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Envois lents sur une connexion mobile, export ZIP d'un gros voyage.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        # L'archive ZIP d'un voyage est produite au fil de l'eau : ne pas la retenir.
        proxy_buffering off;
    }
}
```

```bash
# ln -s /etc/nginx/sites-available/rjaroundtheworld /etc/nginx/sites-enabled/
# rm -f /etc/nginx/sites-enabled/default
# nginx -t && systemctl reload nginx
# certbot --nginx -d journal.exemple.fr
```

Certbot ajoute HTTPS à la configuration et en programme le renouvellement automatique.
