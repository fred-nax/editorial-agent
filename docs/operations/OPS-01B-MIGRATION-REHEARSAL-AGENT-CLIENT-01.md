# OPS-01B — Sauvegarde préalable & répétition migration V7.8.3 → V7.16.3

**Domaine :** https://agent-client-01.naxialis.com/  
**Date :** 2026-11-28  
**Cible Git :** `v7.16.3` (`7976cc57191ef301fcf6651ab6f4397ac5eacbe2`)  
**Ce rapport ne constitue pas une autorisation de déploiement production.**

---

## 1. Identité revalidée

| Élément | Valeur |
|---------|--------|
| Hostname | `vps-e29ae25d` |
| Projet | `naxialis-agent-client-01` |
| App | `naxialis-agent-client-01-app-1` · `naxialis-agent:v7.8.3` |
| Started (prod) | `2026-11-17T10:07:04Z` — **inchangé** après OPS-01B |
| PG | `naxialis-agent-client-01-postgres-1` · DB `agent_client_01` |
| Disque | ~42 Go libres (46 % used) |
| RAM available | ~1.8 Gio · swap présent |
| Instance hors périmètre | `agent.naxialis.com` / `v7.8.1` — non modifiée |

---

## 2. Sauvegarde réalisée

| Élément | Valeur |
|---------|--------|
| Destination | `/opt/backups/naxialis-agent-client-01/ops01b-pre-v7163-20261128T104242Z/` |
| Permissions | `700` / fichiers `600` · owner `ubuntu` |
| `postgres.dump` | 196 522 o · SHA-256 `de913c8f477708c4…856e73fc` · format custom |
| `featured-images.tar.gz` | 4 249 280 o · SHA-256 `936e1198909375cb…627831f6` |
| Image ref | `naxialis-agent:v7.8.3` · `sha256:5c9a844d1632…` |
| Compose | copies `docker-compose.yml` + overlays v7.8.x |
| Secrets | **non inclus** (note `SECRETS-NOTE.txt`) — restent dans `.env` mode 600 |
| Intégrité | `sha256sum -c SHA256SUMS` **OK** |
| Prod redémarrée ? | **Non** |

Secrets nécessaires à la restauration (présence seule) : `APP_SETTINGS_ENCRYPTION_KEY`, `AUTH_SECRET`, `ADMIN_*`, Google OAuth — **jamais affichés**.

---

## 3. Baseline client (avant répétition)

| Compteur | Valeur |
|----------|-------:|
| Générations | 3 |
| Images (DB + fichiers) | 3 / 3 |
| WordPressPost | 42 |
| Topics | 4 |
| CustomTheme | 3 |
| EditorialWatchSearch | 2 |
| SeoOpportunity | 13 |
| GscPageDailyStat | 241 |
| Ga4PageDailyStat | 42 |
| GooglePropertySelection | 1 |
| AppSettings | 1 |
| Migrations | 25 |
| Tables GEO | 7 |
| Lignes GEO (Brand…Response) | **0 / 0 / 0 / 0 / 0 / 0 / 0** |
| Workspaces | 0 (table absente) |
| OpenAiUsageEvent | absent |
| estimatedCostSum | 0 |
| WP host (AppSettings) | `permisdexploitation.com` |
| GSC | `https://permisdexploitation.com/` |
| GA4 | `483620950` |
| SEO plugin | `yoast_seo` |

---

## 4. Stack de répétition isolée

| Élément | Valeur |
|---------|--------|
| Projet | `ops-rehearsal-client01` |
| Root | `/opt/ops-rehearsal-client01-v7163` |
| DB | `agent_client_01_rehearse` · user `rehearse` |
| Réseau | `ops-rehearsal-client01-net` · **`internal: true`** (pas d’egress, pas de proxy) |
| Volumes | `rehearse_pg_data` / `rehearse_images_data` (dédiés) |
| Image V7.8.3 smoke | `naxialis-agent:v7.8.3` |
| Image V7.16.3 | `naxialis-agent:v7.16.3-rehearse` · `56bf347a2982` · ~883 Mo |
| Commit source build | `7976cc57191ef301fcf6651ab6f4397ac5eacbe2` |
| Drop GEO dans source/image | **Absent** (`geo-guard` OK) |

### Restauration V7.8.3 (preuve sauvegarde)

- Dump restauré → compteurs 3/3/42/7/25 **OK**  
- Images extraites → 3 fichiers  
- Login/CSRF **200**  
- `wpUrlHost=permisdexploitation.com` · chiffrements présents  
- Réseau unique rehearsal (pas `nginx-proxy_*`)

---

## 5. Liste exacte des 12 migrations

Toutes **additives** ; aucune ne DROP les Visibility* ; drop `20261103173400_…` **hors liste exécutable**.

| # | Migration | Contenu (SQL réel) | Risque données |
|---|-----------|--------------------|----------------|
| 1 | `20261124150000_cms_destination_v790` | Colonnes `cmsDestination`/`cmsExternalId` + index | Faible |
| 2 | `20261124190000_app_settings_webflow_v710` | Colonnes Webflow sur AppSettings | Faible |
| 3 | `20261124220000_editorial_workspaces_v7111` | Crée workspaces, backfill `workspaceId`, issues | **Moyen** (voir §6) |
| 4 | `20261125101500_workspace_default_languages_v7112` | Langues défaut WP=fr / WF=en-US | Faible |
| 5 | `20261125120000_webflow_cms_inventory_v7120` | Table `WebflowCmsItem` | Faible |
| 6 | `20261125160000_featured_image_webflow_v7130` | Colonnes asset Webflow images | Faible |
| 7 | `20261125170000_webflow_cms_references_v7131` | Refs Webflow settings | Faible |
| 8 | `20261125190000_wordpress_cms_references_v7132` | Refs WP Topic/settings | Faible |
| 9 | `20261125200000_gsc_workspace_webflow_v7140` | GSC multi-espace + colonnes | Faible si backfill WP |
| 10 | `20261125210000_ga4_workspace_webflow_v7141` | GA4 multi-espace | Faible |
| 11 | `20261125220000_openai_usage_events_v7150` | Table `OpenAiUsageEvent` (coûts legacy inchangés) | Faible |
| 12 | `20261126100000_auth_login_attempt` | Table rate-limit login | Faible |

Checksums historiques échantillonnés côté release (init / visibility / v782) — cohérents avec l’artefact `v7.16.3`.  
Aucune migration en échec ; **pas** de `migrate resolve`.

---

## 6. Workspaces — résultat critique

Après migration :

| Workspace ID | Provider | Name (libellé migration) | siteUrl (table WS) | Settings wpHost | Google |
|--------------|----------|--------------------------|--------------------|-----------------|--------|
| `ws_wordpress_naxialis` | wordpress | **WordPress naxialis.com** | **https://naxialis.com** | **permisdexploitation.com** | GSC/GA4 client OK |
| `ws_webflow_ai_studio_01` | webflow | Webflow Naxialis AI Studio 01 | (vide) | non configuré (`wfTok=false`) | — |

| Contrôle | Résultat |
|----------|----------|
| Générations / images / WP sans `workspaceId` | **0** |
| `WorkspaceMigrationIssue` | **0** |
| Données métier rattachées au WS WordPress | **Oui** |
| Paramètres CMS/OpenAI client copiés dans `WorkspaceCmsSettings` WP | **Oui** (agent + wpEnc) |
| Webflow activé / token | **Non** |
| Injection secrets Naxialis | **Non** (settings depuis AppSettings client) |

**Risque résiduel UX/branding :** les libellés `EditorialWorkspace.name` / `siteUrl` sont **codés en dur Naxialis** dans la migration V7.11.1, alors que l’URL opérationnelle client est correcte dans `WorkspaceCmsSettings.wpUrl`.  
→ Pour le déploiement réel : prévoir une **correction post-migration contrôlée** des libellés workspace (name/siteUrl/siteLabel) **sans changer les IDs**, ou accepter temporairement l’incohérence d’affichage.

---

## 7. GEO

| Contrôle | Avant | Après |
|----------|------:|------:|
| Tables Visibility* | 7 | **7** |
| Lignes (toutes) | 0 | **0** |
| Migration drop dans `_prisma_migrations` | 0 | **0** |
| Drop dans image/source | absent | **absent** |

---

## 8. Comparaison compteurs (métiers)

| Entité | Avant | Après V7.16.3 | Delta |
|---------|------:|--------------:|-------|
| Générations | 3 | 3 | 0 |
| Images | 3 | 3 | 0 |
| WordPressPost | 42 | 42 | 0 |
| Topics | 4 | 4 | 0 |
| CustomTheme | 3 | 3 | 0 |
| Watch | 2 | 2 | 0 |
| Opportunities | 13 | 13 | 0 |
| GSC pages | 241 | 241 | 0 |
| GA4 pages | 42 | 42 | 0 |
| estimatedCostSum | 0 | 0 | 0 |
| GEO tables/rows | 7 / 0 | 7 / 0 | 0 |
| Migrations | 25 | **37** | +12 |
| Workspaces | 0 | **2** | +2 (légitime) |
| WorkspaceCmsSettings | 0 | 2 | +2 |
| OpenAiUsageEvent | — | 0 | table créée |
| AuthLoginAttempt | — | 0 | table créée |
| WebflowCmsItem | — | 0 | table créée |
| WMI | — | 0 | OK |

---

## 9. Démarrage V7.16.3 (isolé)

| Contrôle | Résultat |
|----------|----------|
| `prisma migrate deploy` | **12/12 OK** (« All migrations have been successfully applied ») |
| DB connectée | `agent_client_01_rehearse` uniquement |
| Health live/ready | **200 / 200** |
| Login page | **200** |
| Themes ensure | **skipped (neutral client install)** |
| Recovery / images | 0 interrupted |
| Appels externes | bloqués (réseau `internal`) |
| Build image | **238 s** · `56bf347a2982` |

Durée boot+migrate observée : migrations appliquées au démarrage puis ready ~quelques secondes après build.

---

## 10. Rollback

### A. Rollback applicatif (image `v7.8.3` sur schéma post-12 mig)

- Conteneur démarre · login/csrf **200** superficiellement.  
- **Non supporté** comme stratégie production : client Prisma ancien vs schéma nouveau ; risque fonctionnel latent.  
- **Ne pas** considérer comme rollback garanti.

### B. Restauration complète V7.8.3 (preuve)

- DB isolée `agent_client_01_rollback783` ← dump OPS-01B  
- Compteurs 3/3/42 · geo 7 · migs **25** · `EditorialWorkspace` **absent**  
- Durée restore DB : **~2 s**  
- → **Chemin de rollback réel** après migration : restore dump+images+image `v7.8.3` (fenêtre maintenance ; perte des écritures post-sauvegarde).

---

## 11. Vérification production post-OPS-01B

| Contrôle | Résultat |
|----------|----------|
| `CURRENT_VERSION` | `v7.8.3` |
| Image / Started | inchangés (`RestartCount=0`) |
| Migrations prod | **25** · pas de workspace · drop=0 |
| HTTPS client-01 | **200** |
| HTTPS agent.naxialis.com | **200** |
| Stack rehearsal | `down -v` (volumes rehearsal seulement) |
| Backup OPS-01B | **conservé** |
| Image `v7.16.3-rehearse` | conservée sur VPS (~883 Mo) |

---

## 12. Durées mesurées

| Étape | Durée |
|-------|------:|
| Dump + archives + SHA | ~quelques secondes |
| Restore V7.8.3 + smoke | ~20 s |
| Build image V7.16.3 | **238 s** |
| Migrate + boot V7.16.3 | ~minutes (inclus recreate) |
| Restore rollback DB | **~2 s** |

Estimation fenêtre maintenance déploiement réel : **30–60 min** (sauvegarde fraîche + build ou image déjà prête + migrate + smokes + décision), hors incident.

---

## 13. Procédure de déploiement définitive (préparée — non exécutée)

1. GO explicite OPS-02 / déploiement.  
2. Maintenance : bloquer écritures métier (annonce).  
3. Sauvegarde fraîche (même méthode OPS-01B) + vérifier SHA.  
4. Conserver image `v7.8.3` + SHA.  
5. Build/tag `naxialis-agent:v7.16.3` depuis commit `7976cc5` · `geo:guard`.  
6. Overlay Compose client-01 uniquement.  
7. Préserver `.env` / **même** `APP_SETTINGS_ENCRYPTION_KEY`.  
8. Migrate contrôlée (gardes docker-start / identité DB `agent_client_01`).  
9. Start app · health · login · workspaces · Google · images · WP inventory.  
10. Corriger libellés workspace (name/siteUrl) si décidé.  
11. Si échec après migrate → **restore complète** (pas seulement rollback image).

---

## 14. Conditions restantes / risques

| Item | Statut |
|------|--------|
| Répétition migration 7.8.3→7.16.3 | **Réussie** |
| Préservation données métier | **OK** |
| GEO | **OK** |
| Isolation prod pendant drill | **OK** |
| Libellés workspace Naxialis hardcodés | **Risque UX** — mitigation post-mig |
| BACKUP auto / copie externe / alertes | **Toujours ouverts** |
| Rollback post-mig | **Restore complète requise** (recommandé) |
| Timer monitoring | Non clos |

---

## 15. Décision

### **GO sous conditions** pour un futur déploiement OPS-02

Conditions :

1. GO humain explicite de déploiement (hors ce rapport).  
2. Sauvegarde fraîche immédiatement avant bascule.  
3. Fenêtre de maintenance + plan restore complète documenté.  
4. Traitement décidé des libellés `EditorialWorkspace` (correction contrôlée vs acceptation temporaire).  
5. Ne toucher que `/opt/naxialis-agent-client-01` / projet Compose client-01.  
6. Pas d’OPS-02 tant que non autorisé.

**NO GO** pour déploiement immédiat sans les conditions ci-dessus.

---

## 16. Non-faits

Aucun déploiement réel · aucune migration sur `agent_client_01` · aucun restart prod · aucun changement proxy · aucun impact `agent.naxialis.com` · aucun appel OpenAI/CMS/Google · aucun commit/push · pas d’OPS-02.
