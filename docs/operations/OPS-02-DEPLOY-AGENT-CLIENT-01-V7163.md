# OPS-02 — Déploiement V7.16.3 sur agent-client-01

**Domaine :** https://agent-client-01.naxialis.com/  
**Date (UTC) :** 2026-11-28T11:34Z → 11:36Z  
**Commit :** `7976cc57191ef301fcf6651ab6f4397ac5eacbe2` · tag `v7.16.3`  
**Prérequis validés :** OPS-01 · OPS-01B · OPS-01C  

**Réouverture des écritures : NON effectuée — en attente de validation finale (OPS-03 hors scope).**

---

## 1. Décision

| Élément | Statut |
|---------|--------|
| Déploiement technique | **Réussi** |
| Migrations (12) | **Appliquées** → 37 total |
| Personnalisation workspaces | **Appliquée** |
| Intégrité données | **OK** |
| Impact `agent.naxialis.com` | **Aucun** |
| Écritures métier | **Toujours marquées gelées** (`OPS02_WRITES_FROZEN`) |
| OPS-03 | **Non autorisé** tant que validation finale absente |

---

## 2. Identité confirmée

| Élément | Valeur |
|---------|--------|
| Hostname | `vps-e29ae25d` |
| Répertoire | `/opt/naxialis-agent-client-01` |
| Projet Compose | `naxialis-agent-client-01` |
| DB | `agent_client_01` · user `client01` |
| `VIRTUAL_HOST` / `AUTH_URL` | `agent-client-01.naxialis.com` |
| Version avant | `v7.8.3` · Started `2026-11-17T10:07:04Z` |
| Version après | **`v7.16.3`** · Started `2026-11-28T11:35:47Z` |
| Image | `naxialis-agent:v7.16.3` = digest `sha256:56bf347a2982…` (retag de `v7.16.3-rehearse` OPS-01B) |
| Image rollback conservée | `naxialis-agent:v7.8.3` · `sha256:5c9a844d1632…` |

Instance hors périmètre : `naxialis-agent-app-1` / `naxialis-agent:v7.8.1` · Started **inchangé** `2026-11-16T22:26:48Z`.  
`nginx-proxy` Started **inchangé** `2026-08-06T20:48:20Z` (pas de redémarrage service partagé).

---

## 3. Ordre d’exécution (réalisé)

1. **Identité + image** — gardes projet/DB/VH ; tag `v7.16.3` ; overlay `docker-compose.v7.16.3.yml` (`SKIP_PRISMA_MIGRATE=1`) ; 12 migs présentes ; drop GEO **absent**.  
2. **Freeze** — `compose stop app` · marker `OPS02_WRITES_FROZEN` · postgres healthy.  
3. **Sauvegarde** — `/opt/backups/naxialis-agent-client-01/ops02-pre-v7163-20261128T113434Z/` + SHA-256 OK.  
4. **Migrations** — one-shot `prisma migrate deploy` sur réseau `agent-client-01-internal` (**4 s**).  
5. **Vérif 37 + GEO** — 37 migs · drop=0 · 7 tables Visibility · 0 lignes GEO · 0 WMI · 0 orphelins.  
6. **Personnalisation** — `ops01c-personalize-workspaces.sql` (gardes DB `agent_client_01`).  
7. **Démarrage** — `compose … -f docker-compose.v7.16.3.yml up -d --force-recreate app` · ready OK.  
8. **Smoke** — live/ready/login/dashboard/csrf **200** ; HTTPS public client-01 **200** ; main **200**.  
9. **Intégrité** — compteurs métier inchangés · config client OK.  
10. **Rapport** — ce document · **écritures non réouvertes**.

---

## 4. Sauvegarde pré-cutover

| Élément | Valeur |
|---------|--------|
| Destination | `/opt/backups/naxialis-agent-client-01/ops02-pre-v7163-20261128T113434Z/` |
| `postgres.dump` | 196 522 o · SHA-256 `bed3d4199e562432e2ee79daaf72ae7f45e8ec9f741872cb2f3a5b1ef1d2754f` |
| `featured-images.tar.gz` | 4 249 235 o · SHA-256 `a2711df6b28652d8f1b1ba5b09517d7faeadf11ad50eadaaad243bb2320fac3b` |
| Intégrité | `sha256sum -c SHA256SUMS` **OK** |
| Secrets | **non inclus** (`.env` local mode 600) |
| OPS-01B | **conservée** (non écrasée) |

---

## 5. Migrations appliquées (12)

Toutes additives ; aucune drop GEO.

| # | Migration |
|---|-----------|
| 1 | `20261124150000_cms_destination_v790` |
| 2 | `20261124190000_app_settings_webflow_v710` |
| 3 | `20261124220000_editorial_workspaces_v7111` |
| 4 | `20261125101500_workspace_default_languages_v7112` |
| 5 | `20261125120000_webflow_cms_inventory_v7120` |
| 6 | `20261125160000_featured_image_webflow_v7130` |
| 7 | `20261125170000_webflow_cms_references_v7131` |
| 8 | `20261125190000_wordpress_cms_references_v7132` |
| 9 | `20261125200000_gsc_workspace_webflow_v7140` |
| 10 | `20261125210000_ga4_workspace_webflow_v7141` |
| 11 | `20261125220000_openai_usage_events_v7150` |
| 12 | `20261126100000_auth_login_attempt` |

`_prisma_migrations` : **25 → 37** · `drop_ai_visibility` : **0**.

---

## 6. Personnalisation workspaces

| Champ | Résultat |
|-------|----------|
| WP id | `ws_wordpress_naxialis` (**inchangé**) |
| WP name | **Permis d'exploitation** |
| WP siteUrl / siteLabel | `https://permisdexploitation.com` / `permisdexploitation.com` |
| `gscPublicSiteUrl` | `https://permisdexploitation.com` |
| `wpUrl` | `https://permisdexploitation.com` (**préservé**) |
| Agent OpenAI | présent (`agent=true`) |
| Credentials WP | présents (`wpEnc=true`) |
| GSC / GA4 | `https://permisdexploitation.com/` / `483620950` |
| Webflow | **Webflow (non configuré)** · pas de token · pas d’agent · pas de Google |
| URL effective | `https://permisdexploitation.com` (plus de fallback `naxialis.com`) |

---

## 7. Intégrité données

| Métrique | Avant | Après |
|----------|------:|------:|
| Générations | 3 | **3** |
| Images | 3 | **3** |
| WordPressPost | 42 | **42** |
| Topics / themes / watch / ops | 4 / 3 / 2 / 13 | **identique** |
| GSC / GA4 daily | 241 / 42 | **identique** |
| Tables GEO | 7 | **7** |
| Lignes GEO | 0 | **0** |
| WMI / orphelins | 0 | **0** |
| estimatedCost sum | 0 | **0** |
| Migrations | 25 | **37** |

---

## 8. Smoke tests

| Contrôle | Résultat |
|----------|----------|
| `/api/health/live` | 200 |
| `/api/health/ready` | 200 |
| `/login` `/dashboard` `/api/auth/csrf` | 200 |
| HTTPS `agent-client-01.naxialis.com/login` | 200 |
| HTTPS `agent.naxialis.com/login` | 200 (non modifié) |
| Appels OpenAI / CMS / Google | **Aucun** pendant OPS-02 |

Note : un premier curl HTTPS sans SNI fiable a échoué brièvement juste après recreate ; recontrôle avec résolution correcte → **200**.

---

## 9. Rollback (si validation refuse)

**Non supporté :** simple bascule d’image vers `v7.8.3` (schéma déjà en 37 migs).

**Chemin validé :** restauration complète depuis  
`/opt/backups/naxialis-agent-client-01/ops02-pre-v7163-20261128T113434Z/`  
(dump + images + image `naxialis-agent:v7.8.3` + compose overlays v7.8.3) — **uniquement sur GO explicite**.  
Durée reprise service ≫ durée `pg_restore` seule.  
Sauvegarder toute donnée produite **après** cutover avant restore.

---

## 10. État opérationnel actuel

| Élément | État |
|---------|------|
| Application | **Up** · `naxialis-agent:v7.16.3` · healthy ready |
| `CURRENT_VERSION` | `v7.16.3` |
| Marker freeze | **`/opt/naxialis-agent-client-01/OPS02_WRITES_FROZEN` présent** |
| Réouverture écritures | **En attente validation finale** |
| OPS-03 | **Non démarré** |

Scripts utilisés (VPS / repo) : `scripts/ops/ops02-deploy-client01.sh`, `ops02-resume-from-backup.sh`, `ops01c-personalize-workspaces.sql`.

---

## 11. Contraintes respectées

| Contrainte | OK |
|------------|----|
| Uniquement agent-client-01 | ✓ |
| Pas de touch `agent.naxialis.com` / autres apps | ✓ |
| Pas de restart nginx-proxy / letsencrypt | ✓ |
| Pas de mig destructive GEO | ✓ |
| Pas d’appel OpenAI payant | ✓ |
| Pas d’écriture CMS / Google / publication | ✓ |
| Pas de restore auto | ✓ |
| Pas de commit / push | ✓ |
| Pas de secret dans ce rapport | ✓ |

**Prochaine étape :** validation humaine → autorisation explicite de **réouverture des écritures** (et seulement ensuite OPS-03 si demandé).
