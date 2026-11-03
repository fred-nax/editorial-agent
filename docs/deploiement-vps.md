# Déploiement VPS — Naxialis Content Agent

Production :

```text
https://agent.naxialis.com
        ↓
jwilder/nginx-proxy + Let's Encrypt companion
        ↓
conteneur app (Next.js, port 3000 interne)
        ↓
conteneur postgres (réseau interne uniquement)
```

Aucun secret n’est compilé dans l’image. Les clés arrivent au runtime via `.env`.

## Domaine et DNS

- Domaine : `agent.naxialis.com`
- Enregistrement A vers le VPS Naxialis (`51.38.230.88`)
- HTTPS : certificat Let’s Encrypt émis par le companion déjà installé (pas de second nginx)

## Reverse proxy existant

Le VPS utilise déjà :

- `jwilder/nginx-proxy`
- companion Let’s Encrypt
- ports publics **80** et **443** uniquement

L’app **n’expose pas** `3000` ni `5432` sur l’hôte. Elle déclare :

```yaml
expose:
  - "3000"
```

et rejoint le réseau Docker **externe** du proxy. PostgreSQL reste uniquement sur le réseau interne `naxialis-agent-internal`.

### Identifier le réseau du proxy (obligatoire, ne pas inventer le nom)

Sur le VPS :

```bash
chmod +x scripts/discover-proxy-network.sh
sh scripts/discover-proxy-network.sh
```

Ou manuellement :

```bash
docker network ls
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
docker inspect <conteneur-nginx-proxy> --format '{{json .NetworkSettings.Networks}}'
```

Reporter le nom exact dans `.env` :

```env
PROXY_NETWORK=nginx-proxy_default
PROXY_EXTERNAL=true
LETSENCRYPT_EMAIL=contact@naxialis.com
```

Réseau réellement utilisé par `jwilder/nginx-proxy` et les apps existantes (`aitracking`) : **`nginx-proxy_default`**. PostgreSQL n’y est pas connecté.

Si le companion exige un email par conteneur, ajouter **le même** email déjà utilisé sur les autres sites :

```env
LETSENCRYPT_EMAIL=...
```

puis décommenter / ajouter `LETSENCRYPT_EMAIL` dans le service `app` de `docker-compose.yml` uniquement si les autres stacks du VPS le font déjà.

## Emplacement sur le VPS

Choisir le dossier déjà utilisé pour les stacks Docker (souvent `/opt` ou `/var/www`). Exemple :

```bash
sudo mkdir -p /opt/naxialis-content-agent
sudo chown "$USER":"$USER" /opt/naxialis-content-agent
```

Ne pas mélanger ce projet avec WordPress ou d’autres compose existants.

## Fichier `.env` production

Ne jamais committer `.env`. Copier `.env.example` et renseigner les vraies valeurs serveur :

| Variable | Production |
|---|---|
| `OPENAI_API_KEY` / `OPENAI_AGENT_ID` | clés réelles |
| `WP_URL` / `WP_USERNAME` / `WP_APP_PASSWORD` | WordPress |
| `POSTGRES_USER` | défaut `naxialis` |
| `POSTGRES_PASSWORD` | mot de passe fort, unique prod |
| `POSTGRES_DB` | `naxialis_agent` |
| `DATABASE_URL` | ignoré par Compose (surchargé vers `postgres:5432`) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://agent.naxialis.com` |
| `AUTH_TRUST_HOST` | `true` |
| `ADMIN_EMAIL` | email de connexion |
| `ADMIN_PASSWORD_HASH` | bcrypt **base64** (`npm run auth:hash-password -- "..."`) |
| `PROXY_NETWORK` | nom Docker **réel** du réseau nginx-proxy |
| `PROXY_EXTERNAL` | `true` en production |

Compose injecte aussi :

- `VIRTUAL_HOST=agent.naxialis.com`
- `VIRTUAL_PORT=3000`
- `LETSENCRYPT_HOST=agent.naxialis.com`
- `HOSTNAME=0.0.0.0` / `PORT=3000`
- `DATABASE_URL=postgresql://USER:PASSWORD@postgres:5432/naxialis_agent`

## Premier déploiement

Depuis la machine de build, copier le code **sans** `node_modules`, `.next`, `.env` :

```bash
rsync -avz --delete \
  --exclude node_modules --exclude .next --exclude .env --exclude .git \
  ./ user@VPS:/opt/naxialis-content-agent/
```

Puis sur le VPS :

```bash
cd /opt/naxialis-content-agent
cp .env.example .env
nano .env
# renseigner secrets + PROXY_NETWORK + PROXY_EXTERNAL=true

docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 postgres
```

Au démarrage du conteneur `app` :

1. `prisma migrate deploy` (jamais `migrate dev`)
2. Next.js `node server.js` sur `0.0.0.0:3000`
3. `[boot] starting` → `recoverStaleGenerations({ fromBoot: true })` → `[boot] ready`

Migrations attendues dans `_prisma_migrations` :

- `20261002103326_init`
- `20261002124031_article_generation_topic_id`

## Vérifications

```bash
docker compose ps
# app healthy, postgres healthy

curl -I https://agent.naxialis.com/login
# HTTP/2 200

curl -I http://agent.naxialis.com
# redirection 301/302 vers HTTPS (gérée par nginx-proxy)

curl -s -o /dev/null -w "%{http_code}" -X POST https://agent.naxialis.com/api/generate \
  -H "Content-Type: application/json" -d '{"subject":"test"}'
# 401

ss -tulpn | grep -E ':3000|:5432|:80|:443'
docker ps --format 'table {{.Names}}\t{{.Ports}}'
# 3000 et 5432 ne doivent pas être publiés sur 0.0.0.0
```

Pages `/dashboard`, `/articles`, `/topics`, `/settings` sans session → `/login`.

## Mise à jour

```bash
cd /opt/naxialis-content-agent
# rsync ou git pull
docker compose build
docker compose up -d
```

`prisma migrate deploy` s’exécute tout seul au boot.

## Backup PostgreSQL

```bash
cd /opt/naxialis-content-agent
mkdir -p /opt/backups/naxialis-content-agent
docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-naxialis}" "${POSTGRES_DB:-naxialis_agent}" \
  > "/opt/backups/naxialis-content-agent/naxialis_agent-$(date +%F-%H%M).sql"
```

Restauration (après arrêt app, volume existant) :

```bash
docker compose stop app
docker compose exec -T postgres \
  psql -U "${POSTGRES_USER:-naxialis}" "${POSTGRES_DB:-naxialis_agent}" \
  < /opt/backups/naxialis-content-agent/fichier.sql
docker compose start app
```

Pas de cron dans cette V1.

## Rollback simple

1. Dump PostgreSQL **avant** une migration risquée
2. Revenir au code précédent (commit / copie)
3. `docker compose build && docker compose up -d`
4. Si la migration est incompatible : restaurer le dump

Pas de blue/green.

## Logs

```bash
docker compose logs -f app
```

Événements : `[boot] starting|recovery complete|ready`, `[generation] queued|started|completed|failed`.

Vérifier l’absence de secrets :

```bash
docker compose logs app | grep -Ei 'OPENAI_API_KEY|WP_APP_PASSWORD|AUTH_SECRET|DATABASE_URL|ADMIN_PASSWORD_HASH|POSTGRES_PASSWORD' || true
```

## Dev local

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Publie `APP_PORT` (défaut 3002) pour le test hors proxy. Ne pas utiliser `docker-compose.local.yml` sur le VPS.

`npm run dev` continue d’utiliser `DATABASE_URL` vers `127.0.0.1`.

## Limites V1

- un seul process Node, pas de Redis / BullMQ / worker
- génération `running` interrompue par un redémarrage → `failed` au boot
- PostgreSQL inaccessible depuis Internet
- HTTPS et certificats délégués au reverse proxy existant
