# V7.11.0 — Espaces éditoriaux (Editorial Workspaces)

**Base :** tag `v7.10.2` (`89296ca`)  
**Nature de ce document :** audit + conception uniquement.  
**Hors scope immédiat :** modification Prisma, migration appliquée, implémentation UI/serveur.

---

## 1. Audit du schéma actuel (v7.10.2)

### 1.1 Contexte d’installation

L’application est aujourd’hui **mono-installation** :

- Une seule ligne `AppSettings` (`id = "default"`) mélange WordPress + Webflow.
- Une seule ligne `GoogleConnection` / `GooglePropertySelection`.
- Toutes les tables métier sont **globales** (aucun `workspaceId`).
- `cmsDestination` sur `ArticleGeneration` distingue WP/Webflow **après** génération, mais n’isole pas Topics, veille, SEO, inventaire, Analytics.

Résultat observé en V7.10.2 : Dashboard / Historique peuvent coexister WP + Webflow, mais File, Veille, Opportunités, Inventaire et Analytics restent implicitement WordPress-centrés et **polluent** l’expérience Webflow.

### 1.2 Modèles Prisma actifs (schéma applicatif)

| Modèle | Rôle | Uniques / index notables | Isolation aujourd’hui |
|--------|------|--------------------------|------------------------|
| `ArticleGeneration` | Générations + usage + trace | PK `id` ; `cmsDestination`, `cmsExternalId`, `topicId` sans FK | Partielle via `cmsDestination` |
| `ArticleFeaturedImage` | Images à la une | FK `generationId` CASCADE ; index status | Indirecte (via génération) |
| `Topic` | File éditoriale | `@@unique([sourceUrl, subject])` | **Aucune** |
| `EditorialWatchSearch` | Historique veille | index `searchedAt` | **Aucune** |
| `WordPressPost` | Inventaire contenus WP | `wpPostId` **unique global** | WP only, global |
| `WordPressSyncRun` | Runs de sync inventaire | — | WP only, global |
| `CustomTheme` | Thématiques SEO | `legacyKey` unique | **Aucune** (catalogue partagé) |
| `ResearchConfig` | Configs recherches SEO | FK `customThemeId` SetNull | **Aucune** |
| `OpportunitySearchRun` | Runs recherche opportunités | FK config/theme | **Aucune** |
| `SeoOpportunity` | Opportunités | `fingerprint` **unique global** ; FK theme | **Aucune** |
| `AppSettings` | Secrets + CMS + catégories | singleton `default` | **Global mélangé WP+Webflow** |
| `GoogleConnection` | OAuth Google | singleton `default` | **Global** |
| `GooglePropertySelection` | Propriétés GSC/GA4 | 1-1 connection | **Global** |
| `GoogleSyncRun` | Sync Google | FK connection | **Global** |
| `GscPropertyDailyStat` | Totaux GSC propriété | unique `(propertyUrl, date)` | Lié à propriété, pas à espace |
| `GscPageDailyStat` | GSC pages | unique `(propertyUrl, pageUrlNorm, date)` | idem + `wpPostId` optionnel |
| `GscQueryDailyStat` | GSC requêtes | unique composé | idem |
| `Ga4PageDailyStat` | GA4 pages | unique `(propertyId, pageUrlNorm, date)` | idem |
| `Ga4PageSourceDailyStat` | GA4 sources | unique composé | idem |

**Relations explicites Prisma :**

- `ArticleFeaturedImage` → `ArticleGeneration` (Cascade).
- `ResearchConfig` / `OpportunitySearchRun` / `SeoOpportunity` → `CustomTheme` (SetNull).
- `OpportunitySearchRun` → `ResearchConfig` (SetNull).
- `GooglePropertySelection` / `GoogleSyncRun` → `GoogleConnection` (Cascade).

**Absences structurantes :**

- Pas de FK `Topic` ↔ `ArticleGeneration` (seulement `topicId` string).
- Pas de FK `SeoOpportunity.topicId` / `searchRunId`.
- Pas de modèle inventaire Webflow.
- Pas de table de cache persistante (caches = mémoire process / snapshots JSON).

### 1.3 Tables GEO historiques (à préserver)

Les **sept tables GEO** créées par les migrations `20261028230000` (+ enrichissements 1.1 / 1.1.1) :

1. `VisibilityBrand`
2. `VisibilityCampaign`
3. `VisibilityQuestion`
4. `VisibilityResponse`
5. `VisibilityEntity`
6. `VisibilityMention`
7. `VisibilityCitation`

Elles sont **retirées du schéma Prisma applicatif** (module GEO retiré), mais la contrainte produit reste :

> **Aucune migration V7.11 ne doit `DROP` ces tables ni leurs enums.**

État local observé au moment de l’audit : tables GEO absentes de la DB de dev (déjà absentes ou jamais présentes). Les VPS / copies de prod peuvent encore les contenir — la migration V7.11 doit être **additive uniquement**.

### 1.4 Secrets et configuration (AppSettings)

Champs sensibles / CMS actuellement **co-localisés** dans le singleton :

| Champ | Nature | Destination logique |
|-------|--------|---------------------|
| `openaiApiKeyEncrypted` | Secret global OpenAI | **Global** (clé API partagée) |
| `openaiAgentId` | Agent WP | Espace WordPress |
| `openaiWebflowAgentId` | Agent Webflow | Espace Webflow |
| `wpUrl` / `wpUsername` / `wpAppPasswordEncrypted` | Connexion WP | Espace WordPress |
| `wpCategories*` / `wpAllowed*` / `wpSeoPlugin` / `inventory*` | Config éditoriale WP | Espace WordPress |
| `webflowApiTokenEncrypted` / `webflowSiteId` / `webflowCollectionId` / `webflowFieldMappingJson` | Connexion Webflow | Espace Webflow |
| `clientName` / `siteName` | Identité install | Global ou dérivé par espace |

Google OAuth (`GoogleConnection`) : aujourd’hui mono-compte. Pour V7.11, décider si un compte Google peut servir plusieurs espaces (même propriété vs propriétés distinctes). Hypothèse de conception : **une sélection de propriétés par espace**, compte OAuth éventuellement partagé (voir §2).

### 1.5 Flux runtime à risque de contamination

| Flux | Fichiers / services | Risque |
|------|---------------------|--------|
| Génération | `lib/generation.ts`, `lib/agent/run-session.ts`, `/api/generate` | OK partiel (`cmsDestination` figé) ; Topics liés non scopés |
| Boot / reprise | `lib/boot.ts`, `lib/generation-recovery.ts`, `lib/images/pipeline.ts` | Relance **toutes** les queues sans workspace |
| Inventaire + maillage | `lib/seo/wordpress-inventory.ts`, `lib/agent/internal-links/*` | Corpus WP global ; utilisé pour rapprochements & scoring SEO |
| Rapprochements | `lib/topics/*`, `/api/topics/check-duplicates` | Lit `WordPressPost` global |
| Opportunités | `lib/seo/opportunity-search.ts` | Fingerprints / thèmes / similarPosts globaux |
| Veille | `lib/veille/*` | Historique global |
| Analytics | `lib/google/*`, pages Analytics | Stats liées aux propriétés Google globales + mapping `wpPostId` |
| Dashboard KPI | `app/(protected)/dashboard/page.tsx` | Agrège déjà WP+Webflow (voulu en multi-CMS) mais sans séparation d’espace |

### 1.6 Comptages locaux (indicatif audit)

Sur la DB locale au moment de l’audit :

- `ArticleGeneration` : 13  
- `Topic` : 6  
- `WordPressPost` : 110  
- `EditorialWatchSearch` : 3  
- `CustomTheme` : 5  
- `SeoOpportunity` : 0  

Ces chiffres serviront de **baseline** pour le protocole de migration (répéter sur copie restaurée).

---

## 2. Architecture cible

### 2.1 Principes

1. **Une app privée**, un PostgreSQL, **N espaces éditoriaux** isolés.
2. **Pas de SaaS multi-tenant** : pas de billing, pas d’orgs publiques, un seul Auth.js admin.
3. Isolation **serveur d’abord** (`workspaceId` obligatoire sur lectures/écritures métier).
4. **Aucun fallback silencieux** vers WordPress.
5. Les fonctionnalités absentes côté Webflow affichent un **état vide explicite**, jamais les données WP.

### 2.2 Espaces initiaux

| Espace | `cmsProvider` | Site | Rôle |
|--------|---------------|------|------|
| WordPress Naxialis | `wordpress` | `https://naxialis.com` | Éditorial historique WP |
| Webflow AI Studio | `webflow` | Naxialis AI Studio 01 | Éditorial Webflow CMS |

### 2.3 Modèle proposé `EditorialWorkspace`

```prisma
model EditorialWorkspace {
  id              String   @id @default(cuid())
  slug            String   @unique // ex. "wordpress-naxialis", "webflow-ai-studio-01"
  name            String   // "WordPress naxialis.com"
  cmsProvider     String   // "wordpress" | "webflow"
  siteUrl         String?  // URL canonique site / studio
  siteLabel       String?  // "Naxialis AI Studio 01"
  defaultLanguage String   @default("fr")
  enabled         Boolean  @default(true)
  /// Pointeur optionnel vers un profil de connexion CMS (voir §2.4)
  cmsConnectionKey String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([cmsProvider, enabled])
}
```

Champs métier à rattacher ensuite : `workspaceId` (NOT NULL après backfill) sur les modèles listés §3.

### 2.4 Global vs par espace

#### Rester **global** (installation)

| Élément | Justification |
|---------|---------------|
| Auth.js / comptes admin | App privée mono-utilisateur organisationnel |
| `openaiApiKeyEncrypted` | Une clé OpenAI pour l’installation |
| Instructions agent OpenAI distantes | Gérées hors DB locale ; agents IDs restent liés aux espaces |
| Préférences UI purement locales (sidebar collapsed) | Cookie/localStorage |
| Tables GEO orphelines | Conservées intactes, hors produit |
| Catalogue technique des destinations CMS (`CMS_DESTINATION_CATALOG`) | Code, pas données |

#### Appartenir à **chaque espace**

| Élément | Notes |
|---------|-------|
| Agent éditorial (`openaiAgentId` ou `openaiWebflowAgentId`) | Déjà séparés conceptuellement |
| Connexion CMS (WP ou Webflow) | Token, URL, mapping, catégories |
| Inventaire contenus | WP posts ; futur inventaire Webflow |
| Topics / générations / images | Données éditoriales |
| Veille / opportunités / thèmes / research configs | Données SEO éditoriales |
| Sélection propriétés Google + stats associées | Ou filtrage strict par `propertyUrl`/`propertyId` de l’espace |
| Caches dérivés (rapprochements, url maps) | Clés préfixées par `workspaceId` |
| Tâches async (queue génération, sync inventaire, sync Google, featured images) | Doivent porter / résoudre `workspaceId` |

#### Éviter la duplication inutile des secrets

Proposition de découpage `AppSettings` **sans explosion** :

**Option recommandée (additive, progressive) :**

1. Conserver `AppSettings` singleton pour secrets **globaux** (`openaiApiKeyEncrypted`, `clientName`).
2. Introduire `WorkspaceCmsSettings` (1-1 ou 1-n avec `EditorialWorkspace`) contenant uniquement les champs CMS/agent de l’espace :
   - WordPress : url, user, password chiffré, catégories, seo plugin, inventory origin/valid.
   - Webflow : token chiffré, siteId, collectionId, mapping JSON, agentId.
3. Migrer les colonnes existantes de `AppSettings` vers les lignes workspace correspondantes, puis laisser les colonnes legacy en lecture seule jusqu’à V7.12 (pas de drop en V7.11).

**Google :**

- **Phase A (V7.11)** : un `GoogleConnection` global ; `GooglePropertySelection` gagne `workspaceId` (ou table `WorkspaceGoogleSelection`) pour lier GSC/GA4 à un espace.
- **Phase B (ultérieure)** : multi-comptes Google seulement si nécessaire.

### 2.5 Détermination CMS / agent à la génération

Règle cible :

> L’espace actif impose `cmsProvider` et l’agent. L’UI **ne choisit plus** librement WordPress/Webflow sur `/articles/new` (le picker devient informatif / lecture seule, ou disparaît).

- Workspace WP → toujours `create_wordpress_draft` + outils WP.
- Workspace Webflow → toujours `create_webflow_draft` + outils Webflow.
- `ArticleGeneration.workspaceId` + `cmsDestination` figés à la création (déjà le cas pour `cmsDestination`).
- Changement d’espace UI pendant un run : **sans effet** sur la génération en cours (contexte résolu côté serveur depuis l’enregistrement).

---

## 3. Liste des modèles concernés

### 3.1 Doivent recevoir `workspaceId` (obligatoire après backfill)

| Modèle | Priorité | Remarques migration |
|--------|----------|---------------------|
| `ArticleGeneration` | P0 | Backfill via `cmsDestination` (`webflow` → WS Webflow, sinon WS WP) |
| `ArticleFeaturedImage` | P0 | Hérité de la génération (pas besoin de colonne si jointure stricte ; recommandé quand même pour filtres directs) |
| `Topic` | P0 | Ambigu : historique → WP après vérif ; topics liés à générations Webflow → WS Webflow |
| `EditorialWatchSearch` | P0 | Historique → WP (veille actuelle WP-centrique) |
| `WordPressPost` | P0 | → WS WordPress uniquement |
| `WordPressSyncRun` | P0 | → WS WordPress |
| `CustomTheme` | P1 | Dupliquer seed par espace **ou** partager lecture seule globale ? **Recommandation :** rattacher / cloner par espace pour éviter contamination SEO |
| `ResearchConfig` | P1 | Suit les thèmes |
| `OpportunitySearchRun` | P1 | Suit l’espace |
| `SeoOpportunity` | P1 | `fingerprint` unique devient `@@unique([workspaceId, fingerprint])` |
| Google stats (`Gsc*`, `Ga4*`) | P1 | Soit `workspaceId`, soit isolation via `propertyUrl`/`propertyId` whitelist de l’espace |
| `GoogleSyncRun` | P1 | workspace de la sélection |
| `GooglePropertySelection` | P1 | 1 sélection par workspace |

### 3.2 Restent sans `workspaceId` (global)

| Modèle | Motif |
|--------|-------|
| `AppSettings` (réduit) | Secrets globaux résiduels |
| `GoogleConnection` (phase A) | Compte OAuth install |
| Tables GEO ×7 | Hors produit, intouchables |

### 3.3 Nouveaux modèles

| Modèle | Rôle |
|--------|------|
| `EditorialWorkspace` | Espace éditorial |
| `WorkspaceCmsSettings` | Connexion + agent + mapping CMS par espace |
| `WorkspacePreference` (optionnel) | Dernier espace sélectionné (si persisté serveur) |

### 3.4 Contraintes uniques à faire évoluer

| Contrainte actuelle | Cible |
|---------------------|-------|
| `WordPressPost.wpPostId @unique` | `@@unique([workspaceId, wpPostId])` |
| `Topic @@unique([sourceUrl, subject])` | `@@unique([workspaceId, sourceUrl, subject])` |
| `SeoOpportunity.fingerprint @unique` | `@@unique([workspaceId, fingerprint])` |
| `CustomTheme.legacyKey @unique` | `@@unique([workspaceId, legacyKey])` (si thèmes scopés) |
| Uniques GSC/GA4 | Conserver + index `workspaceId` si colonne ajoutée |

### 3.5 Contraintes relationnelles anti-croisement

À introduire (logique applicative + checks SQL) :

1. `ArticleGeneration.workspaceId` = `Topic.workspaceId` si `topicId` non null.
2. `ArticleFeaturedImage` → génération du même workspace.
3. `SeoOpportunity.themeId` → `CustomTheme` du même workspace.
4. `ResearchConfig.customThemeId` / runs → même workspace.
5. Interdiction d’attacher un `WordPressPost` à un workspace `webflow`.
6. Génération Webflow : `cmsDestination = 'webflow'` et `workspace.cmsProvider = 'webflow'` (check serveur).

---

## 4. Proposition de migration (additive, non destructive)

### 4.1 Principes

- Uniquement `ADD COLUMN` / `CREATE TABLE` / backfill / `SET NOT NULL` **après** validation.
- Aucun `DROP TABLE` GEO.
- Aucun rewrite destructif d’IDs.
- Test obligatoire sur **copie restaurée** de PostgreSQL avant prod.

### 4.2 Étapes

#### Étape A — Structures

1. Créer `EditorialWorkspace`, `WorkspaceCmsSettings`.
2. Insérer les deux espaces initiaux (ids stables ou slugs stables).
3. Ajouter `workspaceId` **nullable** sur tous les modèles P0/P1.

#### Étape B — Backfill déterministe

| Donnée | Règle |
|--------|-------|
| `ArticleGeneration` où `cmsDestination = 'webflow'` | → workspace Webflow |
| Autres `ArticleGeneration` (`wordpress`, `null`, autre) | → workspace WordPress |
| `ArticleFeaturedImage` | via `generationId` |
| `WordPressPost`, `WordPressSyncRun` | → WordPress |
| `EditorialWatchSearch` | → WordPress (sauf preuve contraire) |
| Google selections / stats | → WordPress si propriété = naxialis.com ; sinon **ambiguous** |
| `CustomTheme` / configs / opportunities / runs | → WordPress en V7.11 (origine produit Naxialis) ; cloner catalogue vide pour Webflow |

#### Étape C — Ambiguës (traitement explicite)

Créer une table temporaire ou un rapport `WorkspaceMigrationIssue` :

| Cas | Action proposée |
|-----|-----------------|
| Topic sans génération liée | Assigner WP + flag `migrationNote` |
| Topic lié à génération Webflow | Assigner Webflow |
| Topic lié à plusieurs générations d’espaces différents | **Manuel** — dupliquer le topic |
| GSC/GA4 propertyUrl hors naxialis.com | Manuel / laisser null jusqu’à sélection workspace |
| `SeoOpportunity` sans fingerprint | Assigner WP |
| Génération Webflow sans `cmsExternalId` (échec) | Toujours Webflow (destination figée) |

Aucune assignation silencieuse croisée.

#### Étape D — Vérifications

Script de validation (à écrire en phase implémentation) :

1. Comptages avant/après par table.
2. `COUNT(*) WHERE workspaceId IS NULL` = 0 sur tables P0.
3. Aucune génération Webflow dans workspace WP et inversement.
4. Aucun `WordPressPost` hors workspace WP.
5. FK logiques topic/génération cohérentes.
6. Somme des KPI dashboard par espace = total historique (à tolérance docs).

#### Étape E — Contraintes

1. `SET NOT NULL` sur `workspaceId`.
2. Recréer uniques composites.
3. Index `(workspaceId, createdAt)` etc.
4. **Ne pas** supprimer les colonnes legacy `AppSettings` Webflow/WP dans V7.11 (compat lecture).

### 4.3 Copie de test PostgreSQL

Protocole :

1. `pg_dump` prod ou staging → restore local `naxialis_agent_v711_migtest`.
2. Appliquer migrations A–E.
3. Exécuter suite isolation + scripts de comptage.
4. Comparer dumps rowcounts.
5. Seulement ensuite : migration sur environnement réel.

---

## 5. Stratégie d’isolation backend

### 5.1 Contexte workspace

Introduire un helper serveur unique, par ex. :

```ts
// lib/workspace/context.ts (cible)
resolveActiveWorkspaceId(request | cookie | header): Promise<string>
requireWorkspace(id): Promise<EditorialWorkspace>
assertSameWorkspace(a, b): void
```

Sources possibles (par priorité) :

1. Cookie httpOnly `naxialis_workspace` (sélecteur sidebar).
2. Override explicite body/query **uniquement** si égal au cookie (anti-tampering soft) — ou ignorer le client et ne faire confiance qu’au cookie + contrôles objet.
3. Pour les jobs async : `workspaceId` **persisté** sur l’entité (génération, sync run), jamais relu depuis le cookie.

### 5.2 Couche d’accès

Pattern recommandé :

- `withWorkspace(workspaceId, (db) => …)` n’est pas natif Prisma → préférer :
  - helpers `workspaceWhere(workspaceId)` ;
  - repositories (`topicsRepo.list(workspaceId)`, `generationsRepo.create(workspaceId, …)`) ;
  - garde systématique dans les routes `requireAuth` + `requireWorkspace`.

**Règle d’or :** tout `findUnique` par id doit vérifier `record.workspaceId === activeWorkspaceId` (ou workspace de la ressource parente), sinon 404.

### 5.3 Jobs / boot / recovery

Adapter :

- `recoverStaleGenerations` → grouper par `workspaceId`, relancer avec ce contexte.
- `enqueueArticleGeneration` → lit `generation.workspaceId`.
- `enqueueWordPressInventorySync` → workspace WP only ; refuse Webflow.
- `enqueueGoogleSync` → sync limité aux propriétés de l’espace (ou sync global puis lecture filtrée — préférer scoped).
- `enqueueOpportunitySearch` → espace actif figé sur le run.
- Featured image pipeline → hérite génération.

### 5.4 Caches

| Cache | Adaptation |
|-------|------------|
| `buildPublishedUrlMap()` | Filtrer inventaire par workspace |
| Rapprochements / similarité | Queries `WordPressPost` workspace-scoped |
| Seed thèmes | Par workspace (ou seed WP only) |
| Prisma `globalThis` client | Inchangé (pas un cache métier) |

### 5.5 Interdiction fallback WP

- `resolveEditorialAgentForDestination` / workspace : si agent Webflow manquant → **erreur**, pas de repli `OPENAI_AGENT_ID`.
- Espace Webflow : routes inventaire WP / featured upload → **404 ou 501 empty state**, jamais données WP.

---

## 6. Routes et services à adapter

### 6.1 UI contrôlée par l’espace actif

| Surface | Route page | APIs / lectures à scoper |
|---------|------------|--------------------------|
| Sélecteur sidebar | layout protégé | `GET/POST /api/workspace` (**à créer**) |
| Dashboard | `/dashboard` | générations, topics, veille, sync Google (RSC) |
| Nouvel article | `/articles/new` | `/api/generate`, `/api/titles/suggest`, `/api/topics/check-duplicates`, `/api/topics/analyze-similarity` |
| Historique | `/articles`, `/articles/[id]` | `/api/articles/[id]`, featured-image/* |
| File | `/topics` | `/api/topics`, `/api/topics/[id]` |
| Opportunités | `/opportunities` | `/api/opportunities*`, `/api/research-configs*`, `/api/custom-themes*` |
| Veille | `/veille` | `/api/veille/search`, `/api/veille/searches*`, `/api/veille/suggestions` |
| Analytics | `/analytics` | `/api/google/metrics/page`, sync status filtré |

### 6.2 Inventaire API à adapter (v7.10.2)

#### P0 — données éditoriales (workspace obligatoire)

| Route | Notes |
|-------|-------|
| `POST /api/generate` | Injecter `workspaceId` + imposer `cmsDestination` depuis l’espace |
| `GET/PATCH /api/articles/[id]` | 404 si autre workspace |
| `*/articles/[id]/featured-image*` | Hérite workspace génération ; refuser hors WP si non supporté |
| `GET/POST /api/topics` | Filtrer / créer avec workspace |
| `GET/PATCH/DELETE /api/topics/[id]` | Guard workspace |
| `POST /api/topics/check-duplicates` | Inventaire du workspace uniquement |
| `POST /api/topics/analyze-similarity` | idem |
| `GET/POST /api/opportunities*` | Scoper + fingerprint composite |
| `GET/POST /api/research-configs*` | Scoper |
| `GET/POST/PATCH /api/custom-themes*` | Scoper ou cloner |
| `POST /api/veille/search`, `GET /api/veille/searches*` | Historique par espace |
| `POST /api/wordpress-inventory/sync*` | **Uniquement** workspace `wordpress` |

#### P1 — Google / Analytics

| Route | Notes |
|-------|-------|
| `/api/google/properties/select` | Lier sélection → workspace |
| `/api/google/sync`, `/api/google/sync/cron` | Sync scoped ou lecture filtrée |
| `/api/google/metrics/page` | Filtrer property whitelist workspace |
| `/api/google/status` | Statut contextualisé |

#### Global (inchangé ou dual-read)

| Route | Notes |
|-------|-------|
| `/api/auth/[...nextauth]` | Global |
| `/api/settings`, `/api/settings/general` | Secrets globaux (clé OpenAI) |
| `/api/settings/openai*` | Clé globale ; agent IDs → workspace |
| `/api/settings/wordpress*`, `/api/settings/webflow*`, `/api/settings/categories*`, `/api/settings/seo-plugin*` | Écriture vers `WorkspaceCmsSettings` de l’espace actif |
| `/api/cms/destinations` | Peut devenir dérivé de l’espace (lecture seule) |
| `/api/cms/wordpress/test`, `/api/cms/webflow/test` | Tester la connexion de l’espace actif |
| `/api/agent/instructions` | Agent de l’espace actif (pas de modif prompt distant) |
| `/api/google/oauth/*`, `disconnect` | Compte OAuth install (phase A global) |

### 6.3 Global (hors sélecteur de données métier)

| Surface | Comportement |
|---------|--------------|
| Paramètres généraux | Accessibles toujours ; identité install + clé OpenAI |
| Intégrations | Accessibles toujours ; **édition CMS/Google contextualisée** à l’espace actif |

Recommandation UX Intégrations : page globale, panneau WP/Webflow/Google **lié à l’espace sélectionné** (éviter d’écrire les secrets Webflow dans l’espace WP).

### 6.4 Services `lib/` à scoper

- `lib/generation.ts`, `lib/generation-recovery.ts`
- `lib/agent/run-session.ts` (résolution agent via workspace, **sans changer prompts**)
- `lib/agent/registry.ts` (agent imposé par `workspace.cmsProvider`)
- `lib/seo/**`, `lib/veille/**`, `lib/topics/**`
- `lib/google/**`, `lib/images/**`
- `lib/settings/app-settings.ts` → dual-read + `WorkspaceCmsSettings`
- `lib/boot.ts` (recovery / enqueue par workspace)
- `components/navigation.ts` : conserver Paramètres + Intégrations ; le sélecteur d’espace est **au-dessus** de la liste, hors items.

### 6.5 Modules Webflow non disponibles (empty states)

Dans l’espace Webflow, **ne pas** réutiliser les données WP :

| Module | Comportement V7.11 |
|--------|---------------------|
| Inventaire / sync WP | Empty : « Inventaire Webflow non disponible » |
| Rapprochements éditoriaux | Empty (déjà désactivés en V7.10.2 sur destination Webflow) |
| Image à la une | Empty (déjà masqué) |
| Performances SEO article | Empty si pas de mapping URL Webflow |
| Opportunités / thèmes | Soit workspace Webflow vide, soit module marked unavailable — **pas** la liste WP |
| Analytics | Uniquement si propriétés Google liées à l’espace Webflow ; sinon empty |

---

## 7. Stratégie de tests

### 7.1 Fixtures

Créer deux workspaces de test avec **sujets/slugs volontairement identiques** :

- WS-A WordPress : topic « Agents IA PME », slug `agents-ia-pme`, opportunity fingerprint `fp-demo`.
- WS-B Webflow : mêmes chaînes.

### 7.2 Matrice d’isolation

| Test | Attendu |
|------|---------|
| List topics A depuis contexte B | 0 résultats / 404 |
| GET topic A avec cookie B | 404 |
| PATCH/DELETE croisé | 404/403 |
| Rapprochements B | n’utilisent pas `WordPressPost` de A |
| Opportunity fingerprint identique | autorisé dans B (unique composite) |
| Veille A invisible dans B | oui |
| Dashboard counts | disjoints ; somme = total |
| Analytics | pas de pages WP dans B |
| Génération démarrée en A, cookie → B pendant run | termine en A, `workspaceId` inchangé |
| Recovery boot | ne mélange pas les queues |
| Inventaire sync depuis B | refusé |
| Non-régression génération WP draft | inchangée |
| Non-régression génération Webflow draft | inchangée |
| Migration dry-run | rowcounts + zéro NULL workspaceId |
| GEO | tables non droppées (assert migration SQL) |

### 7.3 Types de tests

- Unit : `workspaceWhere`, assertSameWorkspace, backfill rules.
- Integration DB (copie) : migrations + isolation queries.
- Route tests : cookie workspace + auth.
- **Aucun** appel OpenAI payant ; **aucune** écriture CMS distante.

---

## 8. Risques identifiés

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Backfill Topics ambigu | Perte de rattachement / pollution | Rapport d’ambiguïté + duplication manuelle |
| Unique `fingerprint` / `wpPostId` / Topic source | Échec migration si non recomposé | Recréer uniques composites avant NOT NULL |
| Oublier une query Prisma | Fuite cross-workspace | Repos centralisés + tests croisés + grep CI `findMany(` sans workspaceId |
| Cookie workspace spoof | Lecture autre espace | Vérifier ownership sur chaque id ; cookie signé/httpOnly |
| Jobs async sans workspace | Contamination recovery | Persister workspaceId sur runs |
| Google mono-propriété pour deux sites | Analytics faux | Empty state Webflow tant que propriété non liée |
| Dupliquer thèmes SEO | Divergence catalogues | Seed déterministe par workspace + doc |
| Régression picker CMS V7.10 | Confusion UX | Remplacer par badge espace ; documenter breaking UI mineur |
| Secrets dupliqués mal migrés | Auth CMS cassée | Dual-read AppSettings legacy → WorkspaceCmsSettings |
| DROP accidentel GEO | Violation contrainte produit | Revue SQL + test « seven GEO tables untouched » |
| Sur-scoping `CustomTheme` | Opportunités orphelines | Migrer themeId avec même workspace |

---

## 9. Plan d’implémentation progressif

### Phase 0 — Validation du présent document (cette étape)

- Revue produit / technique du modèle, du backfill, du split settings.
- **Stop** : pas de migration ni code workspace avant GO explicite.

### Phase 1 — Fondation données (V7.11.0-alpha)

1. Migration additive workspaces + colonnes nullable.
2. Backfill + rapport ambiguïtés.
3. Scripts de comptage sur copie DB.
4. NOT NULL + uniques composites.
5. Dual-read settings (legacy + workspace).

### Phase 2 — Isolation serveur

1. `resolveActiveWorkspace` + cookie.
2. Scoper repositories / routes P0 (generate, articles, topics).
3. Adapter boot/recovery/queues.
4. Tests d’isolation croisée.

### Phase 3 — UI sélecteur

1. Sélecteur haut de sidebar.
2. Retirer le choix libre CMS sur Nouvel article (imposé par espace).
3. Empty states Webflow.
4. Dashboard / Historique / File / Veille / Opportunités / Analytics scopés.

### Phase 4 — Intégrations & Google

1. Panneaux Intégrations par espace.
2. Liaison propriétés Google ↔ workspace.
3. Filtrage Analytics.

### Phase 5 — Durcissement

1. Interdire routes WP depuis workspace Webflow.
2. CI grep anti-query globale.
3. Documentation ops (restore DB, runbook migration).
4. Tag release V7.11.0.

### Hors V7.11 (backlog)

- Inventaire CMS Webflow.
- Images / auteurs / catégories Webflow.
- Multi GoogleConnection.
- Purge colonnes legacy `AppSettings` (V7.12+).

---

## 10. Décisions à trancher avant implémentation

1. **Thèmes SEO** : clonés par espace (recommandé) ou globaux en lecture ?
2. **Google** : même propriété GSC pour WP seulement en V7.11 (Webflow empty) — OK ?
3. **Sélecteur** : cookie seul vs préférence persistée en DB ?
4. **Intégrations** : page globale à onglets workspace, ou forcer le sélecteur d’espace ?
5. **Topics historiques** sans lien génération : tous WP par défaut — OK ?

---

## 11. Synthèse

V7.11.0 doit transformer une installation **multi-CMS dans un seul seau de données** en **multi-espaces isolés**, sans devenir un SaaS. Le levier principal est `EditorialWorkspace` + `workspaceId` serveur, migration additive, jobs contextualisés, et empty states Webflow honnêtes.

Ce document est le prérequis de validation. **Aucune modification Prisma / migration / code workspace n’a été effectuée dans cette étape.**
