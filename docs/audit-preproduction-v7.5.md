# Audit préproduction — Naxialis Content Agent V7.5

**Date :** 2026-11-13  
**Périmètre :** audit **lecture seule** (aucune migration / déploiement / écriture VPS / commit / reset SEO / `down -v`).  
**Cible production connue :** `https://agent.naxialis.com` · `/opt/naxialis-content-agent` · Docker Compose (`app` + `postgres`) · PostgreSQL 16 · Prisma 7 · Next.js 16.3.8 · **17 migrations** appliquées.  
**HEAD Git local au moment de l’audit :** `7ad728c` (docs V7.4.2) — **la V7.5 n’est pas commitée**.

---

## A. Résumé exécutif

### Décision : **GO sous conditions**

La V7.5 est **techniquement cohérente en local** :

- Migration Prisma **strictement additive**.
- Migration GEO destructive **absente de Git** et **exclue de Docker**.
- Seed catalogue **idempotent** (vérifié en double exécution locale).
- Pagination serveur, reset SEO protégé, UX Opportunités et catalogue dynamique présents et couverts par les tests.
- `typecheck`, `prisma validate`, `npm test` (323 pass / 0 fail / 1 skipped), `next build --webpack` **OK**.

Le déploiement n’est **pas** un GO franc, car :

1. **Tout le lot V7.5 est hors commit** (working tree sale) — aucune archive Git/Docker fiable tant qu’un commit de release n’est pas créé.
2. **Aucun test de migration sur copie de la base de production** n’a été exécuté dans cet audit.
3. Le **backfill `themeId`** n’est **pas** lancé au boot Docker (seulement via `npm run seo:seed-themes`) — procédure à planifier.
4. Le working tree mélange V7.5 SEO et **refonte login** (assets vidéo) — périmètre de release à figer explicitement.

**NO-GO immédiat non déclenché** : la migration `20261103173400_drop_ai_visibility_monitor` n’est **pas** suivie par Git et est listée dans `.gitignore` + `.dockerignore`.

---

## B. Git

### État

| Élément | Constat |
|---|---|
| Branche / HEAD | `7ad728c` — docs archive V7.4.2 |
| Fichiers modifiés (tracked) | 21 fichiers (`OpportunitiesBoard`, APIs, Prisma schema, SEO libs, login, tests…) |
| Fichiers non suivis | 27+ : migration V7.5, `theme-catalog*`, reset, composants opportunities, seed, tests V7.5, login hero/CSS/vidéo, docs |
| `git diff --check` | Pas d’erreur de conflits ; avertissements CRLF `package.json` / `schema.prisma` |
| Secrets | `.env` **ignoré** (`!! .env`) ; aucun `.env` / credential suivi par Git |

### Risques Git

| Risque | Niveau | Mitigation |
|---|---|---|
| Déployer depuis le working tree sans commit | **Bloquant pour la release** | Commit release V7.5 curated + tag ; vérifier archive |
| Embarquer `docs/maquette page login/background.mp4` / `public/login/background.mp4` sans intention | Important | Inclure volontairement ou exclure de l’archive |
| Oublier la migration untracked dans l’archive | **Bloquant** | `git ls-files prisma/migrations \| findstr 20261113120000` doit matcher après commit |
| Contaminer l’artefact avec GEO drop (présent **sur disque**) | Élevé si mauvaise archive | Archive **Git-only** ; jamais `tar` du dossier brut sans ignore |

### Ne pas committer automatiquement

Cet audit **n’a créé aucun commit**. Un commit de release devra être demandé explicitement.

---

## C. Prisma

### Migrations trackées (production attendue = 17)

Les 17 dossiers de migration + `migration_lock.toml` sont suivis par Git (hors drop GEO).  
La V7.5 ajouterait la **18ᵉ** : `20261113120000_seo_themes_catalog_v75` (**untracked** à l’audit).

### Migration V7.5 inspectée

Fichier : `prisma/migrations/20261113120000_seo_themes_catalog_v75/migration.sql`

| Contrôle | Résultat |
|---|---|
| `DROP TABLE` / `TRUNCATE` | **Absent** |
| Suppression de données | **Absente** |
| Colonnes `CustomTheme` additives | `legacyKey`, `explorationAngles`, `defaultQuota` (DEFAULT 5), `sortOrder` (DEFAULT 0), `naxialisServices` |
| Index | `CustomTheme_legacyKey_key` (UNIQUE), `CustomTheme_sortOrder_idx`, `SeoOpportunity_themeId_idx` |
| `SeoOpportunity.themeId` | **Nullable** + FK `ON DELETE SET NULL ON UPDATE CASCADE` |
| Compat anciennes opportunités | OK (nullable, pas de backfill SQL obligatoire) |

### Migration dangereuse GEO

`prisma/migrations/20261103173400_drop_ai_visibility_monitor`

| Contrôle | Résultat |
|---|---|
| Présente sur disque local | **Oui** (SQL avec `DROP TABLE` Visibility*) |
| Suivie par Git | **Non** (`git ls-files` vide) |
| `.gitignore` | **Oui** |
| `.dockerignore` | **Oui** (deux lignes explicites) |
| Contenu V7.5 SQL | Ne référence pas Visibility / DROP |

**Si cette migration apparaît dans un commit, une archive ou le contexte Docker → NO-GO immédiat.**

### Schéma applicatif vs tables GEO historiques

Le `schema.prisma` **ne déclare plus** les modèles `Visibility*` (module UI retiré).  
Les tables peuvent **exister encore** en production (créées par les migrations GEO antérieures). Elles doivent rester **intactes** : ne jamais appliquer le drop.

---

## D. Seed / catalogue CustomTheme

### Fichiers

- `lib/seo/theme-catalog.ts` — `ensureHistoricalEditorialThemes`, `backfillOpportunityThemeIds`
- `lib/seo/theme-catalog-shared.ts` — mapping domaine / résolution
- `lib/seo/domains.ts` — source de seed (5 domaines), plus runtime exclusif
- `scripts/seed-editorial-themes.ts` — ensure + backfill
- `lib/boot.ts` — **ensure uniquement** au démarrage (pas de backfill)

### Règles d’idempotence (code)

1. `legacyKey` déjà présent → **skip** (aucun écrasement).
2. Homonyme (casse insensible) sans `legacyKey` → attache **seulement** `legacyKey`.
3. Sinon → création.

### Exécution locale (base de test connectée)

Deux passes successives `npm run seo:seed-themes` :

```json
{
  "ok": true,
  "created": [],
  "linked": [],
  "skipped": ["ai_agents", "wordpress_woo", "seo_geo", "saas_web", "automation_api"],
  "opportunityThemeIdsBackfilled": 0
}
```

→ Pas de doublons, pas de renommage, pas de réactivation, pas de reset quotas/angles.

### Risques seed

| Risque | Niveau | Note |
|---|---|---|
| Thème historique **renommé** (label ≠ seed) sans `legacyKey` | Important | Création d’un **nouveau** thème seed + conservation de l’ancien nom → possible doublon logique ; à contrôler en prod après premier ensure |
| Backfill non exécuté au boot | Important | Opportunités restent valides via `theme` string ; `themeId` nullable jusqu’au seed manuel |
| Chiffre « 86 » backfill local | Mineur | **Non transposable** à la production |

---

## E. SEO (moteur, pagination, reset, relations)

### Relations (diagnostic)

| Champ | Nature | Impact reset / migration |
|---|---|---|
| `SeoOpportunity.theme` | String dénormalisé | Conservé |
| `SeoOpportunity.themeId` | FK nullable → CustomTheme | Additive ; SET NULL |
| `SeoOpportunity.searchRunId` | Référence **souple** | Pas de FK cascade |
| `SeoOpportunity.topicId` | Référence **souple** | Topics **non** touchés par reset |
| `OpportunitySearchRun.configId` | FK → ResearchConfig SET NULL | Configs **conservées** au reset |
| `OpportunitySearchRun.customThemeId` | FK → CustomTheme SET NULL | Thèmes conservés |

### Moteur

- `opportunity-search.ts` charge `listActiveEditorialDomains()` (PostgreSQL).
- Fallback `EDITORIAL_DOMAINS` si catalogue actif vide (résilience, pas runtime nominal).
- Scoring / prompts / agent OpenAI / `create_wordpress_draft` : **non modifiés** dans le sens métier (pas de régression détectée dans les contrats de tests).

### Pagination `GET /api/opportunities`

| Contrôle | Résultat |
|---|---|
| `page` / `pageSize` | Oui ; tailles **10 / 20 / 50** ; défaut 20 |
| `skip` / `take` | Oui ; plus de `take: 150` systématique |
| `total` / `pageCount` | Après filtres |
| `summaryCounts` | Globaux (hors filtres table) |
| Tri | `scoreTotal desc`, `title asc`, `id asc` |
| Compat | Champs additionnels ; liste toujours présente |

### Réinitialisation SEO

| Contrôle | Résultat |
|---|---|
| Auth | `requireAuth` |
| Confirm | POST `{ confirm: true }` obligatoire |
| Preview | GET volumes exacts |
| Transaction | `$transaction` + re-check `running` |
| Refuse si recherche active | Oui (409) |
| Conservations | ResearchConfig, CustomTheme, Topic, WP, articles |
| Journalisation | `logInfo` counts uniquement |
| Concurrence | Fenêtre TOCTOU preview→confirm mitigée par re-check transactionnel ; **pas de verrou applicatif global** hors statut `running` |

**Aucune réinitialisation exécutée sur la production dans cet audit.**

---

## F. Docker

| Élément | Constat |
|---|---|
| `Dockerfile` | `prisma generate` + `npm run build` ; runner copie `prisma/` + `docker-start.mjs` |
| Entrypoint | `migrate deploy` → `node server.js` |
| Seed au boot | Via `bootServer()` → `ensureHistoricalEditorialThemes` (pas le script backfill) |
| `.dockerignore` | Exclut `.env`, drop GEO, `docs`, `*.md` |
| Volumes | `postgres_data`, `featured_images_data` — à conserver |
| Variables | Noms attendus via `env_file` / compose (`DATABASE_URL`, Auth, OpenAI, WP…) — **valeurs non affichées** |

### Risque Docker

Si l’image est construite **sans** le dossier migration V7.5 (oublié au commit) : `migrate deploy` ne l’applique pas → colonnes absentes → échecs runtime catalogue.  
**Condition de release :** migration présente dans le contexte de build.

---

## G. Tests locaux (exécutés)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `npx prisma validate` | OK (« The schema … is valid ») |
| `npm test` | **323 pass / 0 fail / 1 skipped** (324 tests, 50 suites) |
| `npx next build --webpack` | OK (exit 0) |

### Avertissement Webpack `lib/db.ts`

```
module.createRequire failed parsing argument.
```

- Observé en build local (trace `lib/db.ts` → boot / routes).
- **Non bloquant** pour le build (compilation réussie).
- Cause : parsing webpack de `createRequire` (rechargement client Prisma). Comportement déjà connu ; runtime Node du conteneur utilise `createRequire` hors bundling page data de façon opérationnelle.
- **Pas de modification Prisma** recommandée sans cause démontrée.

### Test migration sur copie prod

**Non exécuté** — aucune copie isolée de la base de production n’a été fournie / utilisée dans cet audit.  
→ Contrôle **à faire avant GO franc**.

---

## H. Risques résiduels

### Bloquant (release)

1. Working tree V7.5 **non commitée** → pas d’artefact reproductible.
2. Migration V7.5 absente de Git tant que non commitée → risque d’image sans migration.
3. Absence de dry-run migrate sur dump prod.

### Important

4. Backfill `themeId` hors boot — procédure manuelle `seo:seed-themes` après migrate.
5. Thèmes historiques renommés sans `legacyKey` → possible thème seed supplémentaire.
6. Périmètre login (vidéo) mélangé au lot SEO.
7. Concurrence reset / recherche hors statut `running` (faible mais réelle).

### Mineur

8. Warning Webpack `createRequire`.
9. CRLF warnings Git sur Windows.
10. Chiffre backfill local non représentatif de la prod.

---

## I. Plan de déploiement proposé (**ne pas exécuter ici**)

1. **Figer le périmètre** (V7.5 SEO ± login) et **committer** + tag (ex. `v7.5.0`).
2. Vérifier artefact :
   - `git ls-files prisma/migrations | findstr 20261113120000` → présent  
   - `git ls-files prisma/migrations | findstr drop_ai_visibility` → **vide**  
   - Archive Docker / tar : idem + pas de `.env`
3. **Sauvegardes** (voir §J) sous `/opt/backups/naxialis-content-agent/`.
4. (Recommandé) Restaurer dump dans une base **temporaire** → `migrate deploy` → `seo:seed-themes` ×2 → comptes.
5. Sur VPS : déployer image ; laisser `docker-start` faire `migrate deploy` (17→18).
6. Vérifier logs `editorial themes ensure`.
7. Exécuter **une fois** `seo:seed-themes` (ou équivalent exec) pour backfill `themeId` ; noter les counts prod.
8. Smoke : UI thématiques, config recherche, pagination, recherche test, **ne pas** reset SEO en prod sans besoin.
9. Contrôler tables GEO toujours présentes (`\dt Visibility*`) si applicable.

**Interdit :** `migrate reset`, `db push`, `down -v`, `rsync --delete`, appliquer le drop GEO.

---

## J. Retour arrière (documenté, non exécuté)

### Sauvegarde proposée (à préparer sur VPS, sans l’exécuter dans cet audit)

Répertoire : `/opt/backups/naxialis-content-agent/`

- Dump PostgreSQL **custom** (`pg_dump -Fc`) horodaté.
- Copie / archive du répertoire applicatif.
- Volume `featured_images_data` (images générées).
- Conservation de l’**image Docker V7.4.2**.
- Vérification taille / intégrité des archives.
- **Ne pas supprimer** les anciennes sauvegardes.

### Rollback applicatif

- Redeployer l’image **V7.4.2**.
- Les colonnes additives V7.5 restent en base (inoffensives pour l’ancien code si celui-ci ignore les champs inconnus / client Prisma aligné).
- **Un retour image ne restaure pas** le schéma PostgreSQL antérieur.

### Restauration PostgreSQL

- `pg_restore` du dump custom sur instance isolée puis bascule contrôlée.
- Seule voie pour annuler réellement la migration additive si nécessaire.

### Restauration volumes

- Remonter / restaurer `featured_images_data` indépendamment du code.

---

## Synthèse décisionnelle

| Critère | Statut |
|---|---|
| Migration additive V7.5 | OK |
| Exclusion drop GEO (Git + Docker) | OK (disque local seulement) |
| Seed idempotent (local) | OK |
| Tests / build locaux | OK |
| Working tree / commit release | **Manquant** |
| Dry-run migrate sur dump prod | **Manquant** |
| Procédure backfill prod | **À formaliser** |

### **GO sous conditions**

Conditions minimales avant déploiement VPS :

1. Commit + archive de release V7.5 **sans** drop GEO et **avec** migration `20261113120000`.
2. Sauvegardes PG + app + volumes + conservation image V7.4.2.
3. (Fortement recommandé) migrate + seed ×2 sur **copie** de la base prod.
4. Plan opérationnel : migrate auto au boot + seed backfill une fois + smoke SEO.
5. Interdiction formelle `down -v` / drop GEO / reset SEO « de confort » en prod.

---

*Fin de l’audit. Aucun déploiement, aucune écriture production, aucun commit réalisés.*
