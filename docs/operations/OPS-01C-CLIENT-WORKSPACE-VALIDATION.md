# OPS-01C — Validation personnalisation workspaces client (copie isolée)

**Domaine cible :** https://agent-client-01.naxialis.com/  
**Date :** 2026-11-28  
**Cible Git :** `v7.16.3` (`7976cc57191ef301fcf6651ab6f4397ac5eacbe2`)  
**Périmètre :** copie isolée uniquement — **aucun** déploiement réel, **aucune** écriture sur `agent_client_01`, **aucun** impact `agent.naxialis.com`.  
**Ce rapport ne constitue pas une autorisation OPS-02.**

---

## 1. Décision

| Décision | **GO sous conditions** |
|----------|------------------------|
| Personnalisation (copie) | **Validée** |
| Intégrité données (copie) | **Validée** |
| Blocage applicatif release | **Aucun** (correctif = configuration SQL, pas de patch code `v7.16.3`) |
| Condition OPS-02 | Exécuter `scripts/ops/ops01c-personalize-workspaces.sql` **après** les 12 migrations, **avant** réouverture des écritures ; fenêtre maintenance dédiée ; rollback = restauration complète uniquement |

---

## 2. Prérequis réutilisés (OPS-01B)

| Élément | Valeur |
|---------|--------|
| Backup | `/opt/backups/naxialis-agent-client-01/ops01b-pre-v7163-20261128T104242Z/` |
| Intégrité SHA-256 | `sha256sum -c SHA256SUMS` → **OK** (`postgres.dump`, `featured-images.tar.gz`) |
| Stack isolée | `/opt/ops-rehearsal-client01-v7163` · projet `ops-rehearsal-client01` |
| DB copie | `agent_client_01_rehearse` |
| Réseau | `ops-rehearsal-client01-net` · `Internal=true` (pas d’egress) |
| Image | `naxialis-agent:v7.16.3-rehearse` |
| Migrations sur copie | **37** (= 25 baseline + 12) · drop GEO **non** appliqué |

Prod au moment des contrôles : `CURRENT_VERSION=v7.8.3` · Started `2026-11-17T10:07:04Z` · Image `naxialis-agent:v7.8.3` · RestartCount `0` · `_prisma_migrations=25` · table `EditorialWorkspace` **absente**.

---

## 3. Audit des références Naxialis

### 3.1 Classification

| Catégorie | Exemples | Action OPS-01C |
|-----------|----------|----------------|
| **Identifiant technique** | `ws_wordpress_naxialis`, `ws_webflow_ai_studio_01` | **Conservés** (FK / historique) |
| **Libellé / siteUrl seed migration** | `WordPress naxialis.com`, `https://naxialis.com`, `Webflow Naxialis AI Studio 01` | **Personnalisés** sur la copie |
| **Paramètre métier client** | `WorkspaceCmsSettings.wpUrl`, agent OpenAI, WP encrypted, GSC/GA4 | **Préservés** (non modifiés sauf `gscPublicSiteUrl` aligné) |
| **Code legacy conditionnel** | `isNaxialisWpHost(wpUrl)` → formulations Naxialis **seulement** si hôte WP = `naxialis.com` | OK client (`permisdexploitation.com` → `isNaxialisLegacy=false`) |
| **Tests / docs / audits internes** | fixtures `naxialis.com` | Hors runtime client — **ne pas** remplacer globalement |

### 3.2 Chaîne URL publique (impact fonctionnel réel)

`resolveWorkspacePublicSiteUrl` (`lib/google/site-url.ts`) :

1. `WorkspaceCmsSettings.gscPublicSiteUrl`
2. sinon `EditorialWorkspace.siteUrl`
3. sinon config WordPress / `WP_URL`

`loadWorkspaceCmsSettings` expose aussi `gscPublicSiteUrl ?? workspace.siteUrl`.

**Avant personnalisation (copie migrée) :**

| Workspace | name / siteUrl | wpUrl | gscPublicSiteUrl | effective |
|-----------|----------------|-------|------------------|-----------|
| `ws_wordpress_naxialis` | WordPress naxialis.com / `https://naxialis.com` | `https://permisdexploitation.com` | *(vide)* | **`https://naxialis.com`** ← défaut migration |
| `ws_webflow_ai_studio_01` | Webflow Naxialis AI Studio 01 / NULL | vide | vide | NULL |

**Risque :** sans personnalisation, maillage / GSC public / affichage site retombent sur `naxialis.com` alors que le CMS client est correct. **Corrigé** par alignement `siteUrl` + `gscPublicSiteUrl` sur `wpUrl`.

### 3.3 Surfaces examinées

| Surface | Source paramètre | Verdict après perso. |
|---------|------------------|----------------------|
| Dashboard / sélecteur | `name`, `siteLabel`, `siteUrl` | Libellés client / neutres |
| Génération / agent | `WorkspaceCmsSettings.openaiAgentId` | Agent client présent (`agent=true`) |
| Destination WordPress | `wpUrl` + credentials encryptés | Inchangés |
| Identité éditoriale / prompts | `wpUrl` → `isNaxialisWpHost` | `is_naxialis_host=false` |
| Maillage interne / SEO | URL publique effective | `https://permisdexploitation.com` |
| Inventaire WP | `WordPressPost.workspaceId` | 42 / 0 orphelin / IDs stables |
| Veille / opportunités | compteurs inchangés | 2 / 13 |
| GSC / GA4 | `GooglePropertySelection` | `https://permisdexploitation.com/` · `483620950` |
| Images | `ArticleFeaturedImage` | 3 IDs inchangés |
| Config agent | OpenAI workspace | Préservé ; **aucun** appel payant |
| Webflow | tokens / siteId | Absents ; libellé neutre |

### 3.4 Origine du seed Naxialis

Migration `prisma/migrations/20261124220000_editorial_workspaces_v7111/migration.sql` insert les libellés/siteUrl Naxialis en dur tout en recopiant les `AppSettings` client dans `WorkspaceCmsSettings`. Comportement **attendu** de la release ; correctif OPS = **post-migration configuration**, pas modification du tag `v7.16.3`.

---

## 4. Personnalisation appliquée (copie uniquement)

### 4.1 Script

| Fichier | Rôle |
|---------|------|
| `scripts/ops/ops01c-personalize-workspaces.sql` | TX idempotente, gardes DB + workspaces + `wpUrl` |
| `scripts/ops/ops01c-workspace-personalize.sh` | Orchestration restore → migrate → SQL → checks (répétition) |
| `scripts/ops/ops01c-resume-checks.sh` | Reprise checks sur stack déjà migrée |

Gardes d’écriture :

- `current_database()` ∈ `{agent_client_01_rehearse, agent_client_01}`
- existence `ws_wordpress_naxialis` et `ws_webflow_ai_studio_01`
- `wpUrl` non vide, ≠ domaine agent, ≠ hôte `naxialis.com`

### 4.2 Métadonnées modifiées

| Champ | Avant | Après |
|-------|-------|-------|
| WP `name` | WordPress naxialis.com | **Permis d'exploitation** |
| WP `siteUrl` | https://naxialis.com | **https://permisdexploitation.com** (depuis `wpUrl`) |
| WP `siteLabel` | naxialis.com | **permisdexploitation.com** |
| WP `gscPublicSiteUrl` | *(null)* | **https://permisdexploitation.com** |
| WF `name` | Webflow Naxialis AI Studio 01 | **Webflow (non configuré)** |
| WF `siteUrl` | NULL | NULL |
| WF `siteLabel` | Naxialis AI Studio 01 | **Non configuré** |

**Non modifié :** IDs workspaces · `wpUrl` · credentials WP/Webflow · `openaiAgentId` · GSC/GA4 property · SEO plugin · langue / paramètres éditoriaux · relations PG.

### 4.3 Workspace Webflow

| Contrôle | Résultat |
|----------|----------|
| Credentials Naxialis | Absents (`wf=false`) |
| Agent injecté | Non (`agent=false`) |
| Propriété Google | Aucune ligne WF |
| Données WordPress | Aucune (provider webflow) |
| Site Webflow réel | Non |
| Suppression | **Non** — libellé neutre suffisant ; implications FK / UI sélecteur préservées |

---

## 5. Tests métier offline (copie)

| Contrôle | Résultat |
|----------|----------|
| `identity_host` | `permisdexploitation.com` |
| `is_naxialis_host` | `false` |
| `agent_present` | `true` |
| `wf_unconfigured` | `true` |
| `gsc_property_host_ok` | `true` |
| `effective_not_naxialis` | `true` |
| `wp_name_ok` / `wf_name_ok` | `true` |
| Health live / ready | 200 / 200 |
| `/login` `/dashboard` | 200 / 200 (HTML login/app, sans écriture externe) |
| Réseau app | `ops-rehearsal-client01-net` only · Internal=true |
| Appels OpenAI / WP / Webflow / Google | **Aucun** |

---

## 6. Intégrité données (avant → après personnalisation)

| Métrique | Attendu | Après |
|----------|--------:|------:|
| Générations | 3 | **3** |
| Images | 3 | **3** |
| WordPressPost | 42 | **42** |
| Tables GEO `Visibility%` | 7 | **7** |
| Lignes GEO | 0 | **0** |
| WorkspaceMigrationIssue | 0 | **0** |
| Orphelins gen/img/wp | 0 | **0** |
| Gens sur `ws_wordpress_naxialis` | 3 | **3** |
| drop_ai_visibility mig | 0 | **0** |
| `_prisma_migrations` | 37 | **37** |
| Topics / themes / watch / ops | 4 / 3 / 2 / 13 | **identique** |
| GSC / GA4 daily | 241 / 42 | **identique** |
| `estimatedCost` sum | 0 (baseline) | **0** |
| IDs gen / img (échantillon) | stables | **inchangés** |

Seules les métadonnées listées §4.2 ont changé.

---

## 7. Blocages applicatifs

| Item | Statut |
|------|--------|
| Hardcode migration libellés/siteUrl | **Mitigé par SQL post-mig** — pas de changement du tag `v7.16.3` |
| `isNaxialisWpHost` | Non bloquant (dérivé de `wpUrl` client) |
| Fallback `siteUrl` Naxialis | **Bloquant sans perso.** — levé après SQL |
| Correctif code minimal futur (hors OPS-02 immédiat) | Optionnel V7.16.x+ : seed migration / post-migrate hook dérivant `name`/`siteUrl`/`gscPublicSiteUrl` depuis `wpUrl` pour installs non-Naxialis |

**Aucun correctif silencieux du code release n’a été appliqué.**

---

## 8. Plan OPS-02 définitif (à autoriser explicitement)

Instance exclusive : `agent-client-01.naxialis.com` · `/opt/naxialis-agent-client-01` · DB `agent_client_01`.  
Hors périmètre : `agent.naxialis.com` et toutes les autres apps VPS.

### 8.1 Fenêtre de maintenance (estimation)

| Phase | Durée estimée |
|-------|---------------|
| Annonce + freeze écritures (UI / jobs) | 5 min |
| Sauvegarde finale PG + images + SHA-256 + vérif image V7.8.3 conservée | 10–15 min |
| Pull/load image `v7.16.3`, bascule compose, migrate (12), boot ready | 10–15 min |
| SQL personnalisation + smoke + contrôles compteurs | 10 min |
| Marge / décision GO réouverture | 10 min |
| **Total fenêtre** | **≈ 45–60 min** |
| Rollback complet (si échec) | **+30–60 min** (restore PG+images+image V7.8.3+verify — **≠** les ~2 s mesurées pour `pg_restore` seul) |

### 8.2 Procédure exacte

1. **Freeze écritures** sur agent-client-01 uniquement (maintenance mode / arrêt workers si présents).  
2. **Sauvegarde finale** dédiée (nouveau timestamp) : `pg_dump` custom + `featured-images` + `SHA256SUMS` + note image `naxialis-agent:v7.8.3` digest — **ne pas** écraser OPS-01B.  
3. Vérifier SHA-256 ; confirmer image V7.8.3 toujours présente localement.  
4. Déployer image **V7.16.3** (commit `7976cc5`) sur le projet client-01 uniquement.  
5. Démarrer app avec migrations Prisma (**12** additives uniquement) — **interdire** `20261103173400_drop_ai_visibility_monitor`.  
6. Attendre `/api/health/ready`.  
7. Exécuter `scripts/ops/ops01c-personalize-workspaces.sql` contre **`agent_client_01`** (gardes intégrées).  
8. Smoke : login, dashboard, sélecteur workspace (« Permis d'exploitation », Webflow non configuré), inventaire, historique, pas d’URL effective `naxialis.com`.  
9. Contrôles données : 3/3/42/7 GEO/0 WMI/0 orphelins ; GSC/GA4/WP/agent préservés.  
10. **Réouvrir écritures** seulement après validation.  
11. Conserver la sauvegarde post-upgrade de toute donnée produite **après** cutover avant toute décision de restore.

### 8.3 Rollback

| Méthode | Statut |
|---------|--------|
| Simple retag / changement d’image → V7.8.3 **sans** restore DB | **Non supporté** (schéma déjà migré) |
| **Restauration complète** (dump final + images + image V7.8.3 + compose) | **Chemin validé** |
| Données créées après upgrade | Sauvegarder avant restore ; informer le client de la perte potentielle post-cutover |

Durée reprise service ≠ durée `pg_restore` seule.

### 8.4 Hors procédure

- Aucun commit/push requis pour OPS-02 runtime.  
- Aucun changement du tag `v7.16.3`.  
- Aucun secret dans les logs/rapports.  
- Attendre **autorisation explicite** avant exécution.

---

## 9. Teardown validation

**Exécuté** : `docker compose … down -v` — conteneurs, volumes et réseau `ops-rehearsal-client01*` supprimés.  
Prod client-01 toujours `v7.8.3` / Started `2026-11-17T10:07:04Z` / Status `running`.  
Conservés : backup OPS-01B, scripts `/opt/ops-rehearsal-client01-v7163/scripts/`, images `v7.16.3-rehearse` et `v7.8.3`.

---

## 10. Synthèse contraintes respectées

| Contrainte | OK |
|------------|----|
| Pas de déploiement réel / pas de modif `agent_client_01` | ✓ |
| Pas de restart prod client-01 | ✓ (Started inchangé) |
| Pas d’impact `agent.naxialis.com` | ✓ |
| IDs workspaces inchangés | ✓ |
| Agents OpenAI inchangés | ✓ |
| Aucun appel OpenAI / WP / Webflow / Google | ✓ |
| Pas de mig destructive / GEO conservé | ✓ |
| Pas de secret dans ce rapport | ✓ |
| Pas de commit / push / retag | ✓ |

**Prochaine étape :** attendre autorisation explicite pour **OPS-02**.
