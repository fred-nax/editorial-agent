# OPS-01 — Pré-audit VPS (lecture seule)

**Domaine cible :** https://agent-client-01.naxialis.com/  
**Date audit :** 2026-11-27 (UTC)  
**Release cible :** `v7.16.3` (`7976cc57191ef301fcf6651ab6f4397ac5eacbe2`) · `fred-nax/editorial-agent`  
**Périmètre :** uniquement cette instance — **aucune** modification VPS, **aucun** déploiement, **aucun** impact sur `agent.naxialis.com` ni les autres apps.

> Les contrôles locaux V7.16.3 (install neuve, upgrade 7.16.2→7.16.3, rollback) **ne prouvent pas** la compatibilité directe avec la version actuellement déployée sur ce VPS.

---

## 1. Identité VPS

| Élément | Valeur |
|---------|--------|
| Hostname | `vps-e29ae25d` |
| IP (DNS A) | `51.38.230.88` |
| OS kernel | Ubuntu · `6.11.0-29-generic` |
| Accès SSH | `ubuntu@51.38.230.88` (BatchMode, clé déjà autorisée) |
| Identité confirmée | **oui** (`HOST_OK=yes`) |

---

## 2. Cartographie domaine → instance

Chaîne confirmée :

`agent-client-01.naxialis.com` → `nginx-proxy` (jwilder) + `nginx-letsencrypt` → conteneur `naxialis-agent-client-01-app-1` → Compose projet `naxialis-agent-client-01` → PostgreSQL `naxialis-agent-client-01-postgres-1` / DB `agent_client_01`.

| Élément | Valeur |
|---------|--------|
| Projet Compose | `naxialis-agent-client-01` |
| Répertoire | `/opt/naxialis-agent-client-01` |
| Compose actifs | `docker-compose.yml` + overlay `docker-compose.v7.8.3.yml` |
| Conteneur app | `naxialis-agent-client-01-app-1` |
| Image | `naxialis-agent:v7.8.3` |
| Image ID | `sha256:5c9a844d1632…` (`5c9a844d1632`) |
| Created | 2026-11-17T10:06:46Z |
| Port interne | `3000` (`VIRTUAL_PORT=3000`) |
| Ports publiés host | **aucun** (app et PG) |
| Réseau app↔PG | `agent-client-01-internal` (`internal`) |
| Réseau proxy | `nginx-proxy_default` (IP app `172.18.0.5`) |
| Conteneur PG | `naxialis-agent-client-01-postgres-1` · `postgres:16-alpine` · healthy |
| Base | `agent_client_01` |
| User PG | `client01` |
| Volume PG | `naxialis-agent-client-01_postgres_data` (~66 Mo) |
| Volume images | `naxialis-agent-client-01_featured_images_data` → `/app/storage/featured-images` (~4.2 Mo, **3** fichiers) |
| Backups host | `/opt/backups/naxialis-agent-client-01` |
| Releases | `/opt/releases/naxialis-agent-client-01/{v7.8.2,v7.8.3}` |
| Fichier version | `CURRENT_VERSION` = `v7.8.3` |
| Labels Compose | `working_dir=/opt/naxialis-agent-client-01` · config files confirmés |
| `VIRTUAL_HOST` / `LETSENCRYPT_HOST` | `agent-client-01.naxialis.com` |

**Ambiguïté :** aucune — le domaine ne matche qu’un seul conteneur.

---

## 3. Isolation des autres instances

| Instance | Domaine | Image | PG volume | Réseau interne |
|----------|---------|-------|-----------|----------------|
| **Cible** | `agent-client-01.naxialis.com` | `naxialis-agent:v7.8.3` | `naxialis-agent-client-01_postgres_data` | `agent-client-01-internal` |
| Principale Naxialis | `agent.naxialis.com` | `naxialis-agent:v7.8.1` | `naxialis-agent_postgres_data` | `naxialis-agent-internal` |
| Répertoire principal | `/opt/naxialis-content-agent` | — | distinct | — |

**Partagé (ne pas redémarrer / modifier pour OPS-02+ sauf nécessité explicite) :**

- Reverse proxy `nginx-proxy` / `nginx-letsencrypt`
- Réseau `nginx-proxy_default`
- Hôte VPS (disque, mémoire)

PostgreSQL : **deux conteneurs distincts**, volumes distincts, utilisateurs/bases distincts.  
Secrets : `.env` dédié mode `600` sous `/opt/naxialis-agent-client-01/.env` — ne pas substituer par ceux de l’instance principale ni du poste local.

---

## 4. Version actuellement déployée

| Élément | Valeur |
|---------|--------|
| Version déclarée | **V7.8.3** (pas V7.16.2) |
| Tag source release | `v7.8.3` |
| Commit source | `a67d08b557a2c0d542bbeeb2e33facae2dc54828` |
| Overlay Compose | `image: naxialis-agent:v7.8.3` · `build: !reset null` |
| Uptime conteneur | ~10 jours (depuis 2026-11-17) |
| Healthcheck Compose app | **aucun** (`Health=none`) |
| Images rollback locales VPS | `v7.8.2`, `v7.8.1`, `v7.8.0`, … présentes |

**Écart majeur :** cible Git `v7.16.3` ≫ `v7.8.3` déployé. Le scénario local 7.16.2→7.16.3 **n’est pas** représentatif de ce VPS.

---

## 5. PostgreSQL (lecture seule)

| Élément | Valeur |
|---------|--------|
| Version | PostgreSQL **16.14** (Alpine) |
| Base | `agent_client_01` |
| Taille | **11 MB** |
| Migrations appliquées | **25** (toutes `finished`, 0 rollback, 0 drop GEO) |
| Dernière migration | `20261117090000_wp_seo_plugin_v782` (2026-11-17) |

### Compteurs distants (baseline indépendante — ≠ locale)

| Entité | Count |
|---------|------:|
| ArticleGeneration | 3 |
| ArticleFeaturedImage | 3 (fichiers volume : 3) |
| Topic | 4 |
| WordPressPost | 42 |
| GscPageDailyStat | 241 |
| Ga4PageDailyStat | 42 |
| GooglePropertySelection | 1 |
| AppSettings | 1 |
| OpenAiUsageEvent | **table absente** |
| EditorialWorkspace | **table absente** |
| WebflowCmsItem | **table absente** |
| AuthLoginAttempt | **table absente** |

### Google (métadonnées non secrètes)

- GSC : `https://permisdexploitation.com/` (`url_prefix`, `siteOwner`)
- GA4 : property `483620950` · account `252331868` · name `permisdexploitation.com`
- Schéma **pré-workspaces** : pas de colonne `workspaceId` sur `GooglePropertySelection`

### AppSettings (présence uniquement)

- `openaiApiKeyEncrypted` : présent  
- `wpAppPasswordEncrypted` : présent  
- `wpUrl` : renseigné  
- `wpSeoPlugin` : `yoast_seo`  
- Secrets CMS/OpenAI **absents** des variables d’environnement conteneur (stockage chiffré DB attendu)

---

## 6. Protection GEO

| Contrôle | Résultat |
|----------|----------|
| 7 tables Visibility* | **Présentes** |
| Migration `20261103173400_drop_ai_visibility_monitor` dans `_prisma_migrations` | **Absente** (0 ligne) |
| Dossier drop dans image `v7.8.3` | **Absent** (`DROP_ABSENT_OK`) |
| Dossier drop dans source `/opt/releases/.../v7.8.3/source` | **Absent** |
| Migrations création GEO dans image | Présentes (`ai_visibility_*`) — cohérent avec tables orphelines / historiques |

**Règle OPS-02+ :** ne jamais réintroduire ni exécuter le drop ; ne pas `migrate resolve` ; ne supprimer aucune table Visibility.

---

## 7. Migrations nécessaires vers V7.16.3

Migrations **présentes dans `v7.16.3` mais absentes de la DB VPS** (après `20261117090000_wp_seo_plugin_v782`) :

1. `20261124150000_cms_destination_v790`  
2. `20261124190000_app_settings_webflow_v710`  
3. `20261124220000_editorial_workspaces_v7111` ← **workspaces**  
4. `20261125101500_workspace_default_languages_v7112`  
5. `20261125120000_webflow_cms_inventory_v7120`  
6. `20261125160000_featured_image_webflow_v7130`  
7. `20261125170000_webflow_cms_references_v7131`  
8. `20261125190000_wordpress_cms_references_v7132`  
9. `20261125200000_gsc_workspace_webflow_v7140` ← **attache GSC aux workspaces**  
10. `20261125210000_ga4_workspace_webflow_v7141`  
11. `20261125220000_openai_usage_events_v7150`  
12. `20261126100000_auth_login_attempt`  

**Total estimé : 12 migrations additives** (à confirmer par `prisma migrate status` en OPS-02 sur copie, pas en prod).

### Risques schéma

| Risque | Impact |
|-------|--------|
| Introduction `EditorialWorkspace` + backfill | Transformation structurelle ; smoke workspaces obligatoire |
| Remaniement Google selections / stats | Risque de perte ou d’orphaning si migration mal comprise |
| Nouvelles tables Webflow | OK si facultatives |
| `OpenAiUsageEvent` | Nouveau registre ; coûts legacy `estimatedCost` à préserver |
| Saut 7.8.3 → 7.16.3 non testé en local | **Bloquant** pour un GO déploiement immédiat sans drill intermédiaire |
| Après migrations, rollback **applicatif** vers `v7.8.3` | **Non garanti** (schéma plus récent incompatible avec ancienne image) |

---

## 8. HTTPS / reverse proxy

| Contrôle | Résultat |
|----------|----------|
| DNS | A → `51.38.230.88` |
| TLS | Let’s Encrypt · CN=`agent-client-01.naxialis.com` |
| Validité | 2026-11-16 → **2027-02-14** |
| HTTP→HTTPS | 301/308 vers HTTPS |
| Routage | `proxy_pass` upstream → conteneur client-01 (`172.18.0.5:3000`) |
| Headers proxy | `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-Port`, `Proxy ""` |
| HSTS | `max-age=31536000` |
| Exposition directe port app | **Non** |
| `AUTH_URL` | host `agent-client-01.naxialis.com` |
| `AUTH_TRUST_HOST` | `true` |
| `AUTH_TRUST_PROXY` | non défini (vide) |
| Cookies Secure | non inspectés en profondeur (lecture seule) — à smoke post-déploiement |
| Rate-limit V7.16.3 | **absent** de l’image actuelle 7.8.3 ; arrivera avec la nouvelle image |

Aucune modification Nginx effectuée.

---

## 9. Secrets / configuration (présence uniquement — aucune valeur)

| Variable / secret | Runtime conteneur | Notes |
|-------------------|-------------------|-------|
| DATABASE_URL | PRESENT | host docker interne · db `agent_client_01` · user `client01` |
| AUTH_URL | PRESENT | host canonique OK |
| AUTH_SECRET | PRESENT | |
| APP_SETTINGS_ENCRYPTION_KEY | PRESENT | **à conserver** (chiffrements AppSettings) |
| ADMIN_EMAIL / ADMIN_PASSWORD_HASH | PRESENT | |
| GOOGLE_CLIENT_ID / SECRET | PRESENT | |
| OPENAI_* env | ABSENT | clé chiffrée en DB |
| WP_* env | ABSENT | credentials chiffrés / `wpUrl` en DB |
| WEBFLOW_* | ABSENT | pas de Webflow sur cette instance |
| CRON_SECRET | ABSENT | |
| FEATURED_IMAGE_STORAGE_DIR | ABSENT | volume monté sur chemin défaut `/app/storage/featured-images` |
| NODE_ENV | `production` | |

`.env` host : mode `600`, owner `ubuntu`.  
**Ne jamais** remplacer `APP_SETTINGS_ENCRYPTION_KEY` ni coller des secrets d’une autre instance.

---

## 10. Sauvegardes existantes

Répertoire : `/opt/backups/naxialis-agent-client-01` (perms `700`).

| Artefact | Date | Taille approx. |
|----------|------|----------------|
| `postgres-v7.8.2-pre-v783-*.dump` | 2026-11-17 | ~172 Ko · **PostgreSQL custom v1.15** |
| `featured-images-v7.8.2-pre-v783-*.tar.gz` | 2026-11-17 | ~1.5 Mo |
| `app-config-v7.8.2-pre-v783-*.tar.gz` | 2026-11-17 | config |
| `image-v7.8.2-pre-v783-*.txt` | 2026-11-17 | SHA image précédente |
| Équivalents pre-v7.8.2 | 2026-11-17 | présents |
| Dump local appdir `backups/postgres-before-v781.dump` | 2026-11-16 | historique |

| Contrôle | État |
|----------|------|
| Fréquence automatique | **Aucune** (pas de cron/timer dédié client-01) |
| Rétention formalisée | Non |
| Stockage externe chiffré | **Non constaté** |
| Alertes échec | **Non** |
| Manifest SHA-256 type V7.16.3 | Non (backups manuels pré-deploy) |
| Procédure restore ops | Non validée sur ce VPS |

→ **BACKUP-001 reste ouvert opérationnellement.**

**Avant tout déploiement futur :** nouvelle sauvegarde préalable dédiée (PG custom + featured-images + note image SHA + conservation clé chiffrement hors dump).

---

## 11. Ressources VPS

| Ressource | État |
|-----------|------|
| Disque `/` | 77 Go · **46 %** utilisé · ~42 Go libres |
| RAM | 3.7 Gio · ~2.0 Gio available |
| Swap | 2 Gio · ~919 Mio used |
| Docker images agent | plusieurs tags 7.x (~870–877 Mo chacune) |
| Build image V7.16.3 | faisable disque-wise (~1 Go + couches) ; surveiller mémoire pendant build |
| Logs app | erreurs récurrentes `Server Reference ID did not match` (bruit Next) — pas de secret vu |
| Rotation logs Docker | non audité en profondeur ; pas de `docker system prune` |

---

## 12. Compatibilité V7.16.3

| Critère | Évaluation |
|---------|------------|
| Isolation instance | **OK** |
| GEO drop | **OK** (absent artefacts / non appliqué) |
| HTTPS / AUTH_URL | **OK** structurellement |
| Secrets structurels | **OK** (clé chiffrement présente) |
| Saut de version 7.8.3 → 7.16.3 | **Risque élevé** (12 migrations, workspaces) |
| Drill local équivalent | **Non réalisé** |
| Rollback applicatif simple après migrate | **Non garanti** |
| BACKUP ops | **Insuffisant** (pas d’auto / externe) |

---

## 13. Plan de déploiement ciblé (préparé — **non exécuté**)

Périmètre exclusif : `/opt/naxialis-agent-client-01` · projet `naxialis-agent-client-01` · **ne pas** toucher `/opt/naxialis-content-agent`.

1. Vérifier hostname `vps-e29ae25d` et labels `VIRTUAL_HOST=agent-client-01.naxialis.com`.  
2. Créer `/opt/releases/naxialis-agent-client-01/v7.16.3/source` depuis tag **immuable** `v7.16.3` ; vérifier commit `7976cc57191ef301fcf6651ab6f4397ac5eacbe2`.  
3. `geo:guard` / absence drop dans source et image.  
4. **Sauvegarde préalable** vers `/opt/backups/naxialis-agent-client-01/` : `pg_dump -Fc`, tar images, enregistrement SHA image `v7.8.3`, archive config sans secrets en clair si possible.  
5. Conserver image `naxialis-agent:v7.8.3` et note SHA.  
6. `docker build -t naxialis-agent:v7.16.3` **uniquement** depuis le release dir client-01.  
7. Overlay Compose `docker-compose.v7.16.3.yml` (`image: naxialis-agent:v7.16.3`, `build: !reset null`) — ne pas changer `VIRTUAL_HOST` / DB.  
8. Préserver `.env` existant (`APP_SETTINGS_ENCRYPTION_KEY` inchangée).  
9. Migrations : **étape contrôlée séparée** (`SKIP_PRISMA_MIGRATE` / job one-shot) sur inventaire des 12 migrations — idéalement d’abord sur **restore isolée** hors prod.  
10. Basculer uniquement le service `app` du projet client-01.  
11. Smoke : HTTPS login, dashboard, workspaces, compteurs, GSC/GA4 meta, images, decrypt settings (sans afficher clair).  
12. Ne redémarrer ni proxy ni PG principal Naxialis.

### Rollback adapté à l’état VPS actuel

| Situation | Action |
|-----------|--------|
| Échec **avant** migrations / image non démarrée | Repasser overlay `v7.8.3` + image `naxialis-agent:v7.8.3` |
| Échec **après** migrations appliquées | Rollback applicatif vers 7.8.3 **insuffisant** → restauration contrôlée dump+images vers stack/base **isolée** puis bascule humaine ; **jamais** restore automatique destructif sur `agent_client_01` sans GO |

---

## 14. Conditions restantes avant autoriser une sauvegarde / mise à jour distante

1. Autorisation explicite OPS-02 (sauvegarde) puis déploiement.  
2. Drill de migration **7.8.3 → 7.16.3** sur copie restaurée isolée (recommandé fortement).  
3. Sauvegarde préalable fraîche + copie externe chiffrée si possible.  
4. Fenêtre de maintenance / validation humaine workspaces + Google.  
5. Image précédente et procédure rollback documentées pour **ce** saut de version.  
6. Ne pas démarrer OPS-02 / V8 sans GO.

---

## 15. Décision OPS-01

### **GO sous conditions** pour *préparer* le déploiement

**Pas de GO déploiement immédiat.**

Conditions principales :

- Traiter le saut **V7.8.3 → V7.16.3** comme une migration majeure (pas comme l’upgrade local 7.16.2→7.16.3).  
- Exiger sauvegarde préalable + idéalement restore-drill des 12 migrations.  
- Maintenir l’isolation stricte vis-à-vis de `agent.naxialis.com`.  
- Clôturer les volets ops BACKUP (timer/externe/alertes) reste un chantier parallèle ; ne bloque pas forcément un deploy one-shot **si** sauvegarde manuelle fraîche + restore testée, mais BACKUP-001 ops reste **ouvert**.

---

## 16. Non-faits (contraintes respectées)

Aucun : déploiement, `git pull` prod, `docker build` VPS (audit), restart, compose up/down, proxy reload, migration, écriture PG, prune, modification secrets, appels OpenAI/CMS/Google, commit/push, OPS-02, V8.
