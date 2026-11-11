# Audit de déploiement — Naxialis Content Agent V7.2

**Date :** 2026-11-11  
**Périmètre :** audit local + livrable Git reproductible.  
**Interdit dans cet audit :** déploiement VPS, modification PostgreSQL, `docker compose down -v`, redémarrage Docker production, push distant, création automatique du tag.

**Cible production connue :** `https://agent.naxialis.com` · `/opt/naxialis-content-agent` · Docker Compose · reverse proxy `jwilder/nginx-proxy`.  
**Baseline production :** V6.1 · commit `283e424` · **15** migrations Prisma appliquées · tables GEO historiques **conservées**.

---

## Décision finale

### **GO sous conditions**

La V7.2 locale est cohérente (typecheck, `prisma validate`, tests, build webpack). Les migrations V7 sont **additives**. La migration GEO destructive reste **hors Git / hors Docker**. Aucun secret n’a été détecté dans le livrable candidat.

| Condition | Obligatoire avant GO production |
|---|---|
| C1 | Déployer **uniquement** depuis le commit / archive Git ci-dessous (pas depuis un workspace sale contenant le dossier GEO drop). |
| C2 | Vérifier l’archive / le contexte Docker : **absence** de `20261103173400_drop_ai_visibility_monitor`. |
| C3 | Inventaire VPS de `_prisma_migrations` **avant** rebuild (doit lister les 15 migrations V6.1). |
| C4 | Sauvegarde PostgreSQL + volume applicatif + (après création) volume `featured_images_data`. |
| C5 | Test **non destructif** d’écriture du volume images en UID `1001` (`nextjs`) avant bascule trafic. |
| C6 | Ne jamais exécuter `docker compose down -v`. |
| C7 | Tag proposé `v7.2.0` à créer **manuellement** après validation du SHA. |

**NO-GO immédiat** si l’artefact contient la migration GEO drop, si `_prisma_migrations` diverge de l’attendu, ou si le volume images n’est pas inscriptible par UID 1001.

---

## 1. Commit candidat

| Élément | Valeur |
|---|---|
| Branche | `feat/dashboard-shadcn` |
| Baseline | `283e424` — *Ship V6.1 editorial prep UI with additive editorialContext migration.* |
| Commit livrable | **`133c83a198675ed9a3a9cd125ca38af94138fe6e`** (`133c83a`) |
| Message | `Ship V7.0-V7.2 featured images, optional auto image, and title suggestions.` |
| Tag proposé (non créé) | `v7.2.0` |
| Remote local | Aucun remote configuré dans cet environnement (pas de push effectué). |

### Archive reproductible

```bash
# Depuis le commit livrable (working tree propre)
git rev-parse HEAD
git archive --format=tar.gz -o naxialis-v7.2.0-$(git rev-parse --short HEAD).tar.gz HEAD

# Contrôles obligatoires sur l’archive
tar -tzf naxialis-v7.2.0-*.tar.gz | findstr /I "drop_ai_visibility_monitor"
# → aucune ligne attendue

tar -tzf naxialis-v7.2.0-*.tar.gz | findstr /I "featured-image\|titles/suggest\|20261111140000\|20261111160000"
# → chemins V7 présents

tar -tzf naxialis-v7.2.0-*.tar.gz | findstr /I "\.env$\|storage/featured-images/.*\.webp"
# → aucune ligne attendue
```

**Ne pas** inclure : `.env`, `node_modules`, `.next`, images locales sous `storage/featured-images/*`, dumps, caches, migration GEO drop.

---

## 2. Fichiers livrés (depuis `283e424`)

### Modifiés

- `.gitignore` — ignore `storage/featured-images/*` (conserve `.gitkeep`)
- `.env.example` — variables optionnelles V7
- `Dockerfile` — répertoire `/app/storage/featured-images` + `chown` nextjs
- `docker-compose.yml` — volume `featured_images_data` + `FEATURED_IMAGE_STORAGE_DIR`
- `app/(protected)/articles/[id]/page.tsx`
- `app/api/articles/[id]/route.ts`
- `app/api/generate/route.ts`
- `components/ArticleDetailTabs.tsx`, `ArticleForm.tsx`, `ArticleSeoPanel.tsx`, `EditorialContextPanel.tsx`, `GenerationLiveRefresh.tsx`
- `components/dashboard/generate-card.tsx`
- `lib/article-detail-tabs.ts`, `boot.ts`, `db.ts`, `editorial-context.ts`, `generation*.ts`, `topics/build-generation-context.ts`
- `prisma/schema.prisma` — modèle `ArticleFeaturedImage`
- tests UX / editorial-context

### Créés

- `app/api/articles/[id]/featured-image/**` (file, generate, upload, index)
- `app/api/titles/suggest/route.ts`
- `components/TitleSuggestionsPicker.tsx`, `components/ui/dialog.tsx`, `components/articles/FeaturedImagePanel.tsx`
- `lib/images/**`, `lib/titles/**`, `lib/wordpress-media.ts`
- `prisma/migrations/20261111140000_article_featured_image/`
- `prisma/migrations/20261111160000_featured_image_auto_request/`
- `storage/featured-images/.gitkeep`
- `docs/featured-images-v7.md`, `docs/audit-deploiement-v7.2.md`
- `tests/featured-image.test.ts`, `featured-image-auto.test.ts`, `title-suggestions.test.ts`

### Explicitement exclus du livrable

- `prisma/migrations/20261103173400_drop_ai_visibility_monitor/` (présent sur disque local, **gitignored + dockerignored**)
- Images WebP locales sous `storage/featured-images/**`
- `.env`, secrets, archives `*.tar.gz`

---

## 3. Migrations Prisma

### Inventaire production actuelle (15)

1. `20261002103326_init`
2. `20261002124031_article_generation_topic_id`
3. `20261002193600_article_generation_progress`
4. `20261003101000_article_generation_usage_details`
5. `20261028190000_seo_opportunity_finder`
6. `20261028210000_seo_opportunity_finder_v11`
7. `20261028220000_seo_research_config_v12`
8. `20261028230000_ai_visibility_monitor`
9. `20261030190000_ai_visibility_geo_1_1`
10. `20261030194500_ai_visibility_geo_1_1_1`
11. `20261030220000_seo_trend_intelligence_1_3`
12. `20261103204500_topic_veille_source`
13. `20261107183000_article_generation_trace`
14. `20261107191000_editorial_watch_search`
15. `20261111100000_article_generation_editorial_context` ← V6.1

### Nouvelles depuis V6.1 (2) — à appliquer au démarrage `app`

16. `20261111140000_article_featured_image` — **CREATE TABLE** `ArticleFeaturedImage` + index + FK `ON DELETE CASCADE` vers `ArticleGeneration`  
17. `20261111160000_featured_image_auto_request` — **ADD COLUMN** `visualInstructions`, `origin` (DEFAULT `'manual'`) + index `(status, updatedAt)`

Les deux migrations sont **strictement additives** (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`). Aucune suppression de table/colonne. Les générations V6.1 restent valides (pas de ligne `ArticleFeaturedImage` requise ; `editorialContext` JSONB inchangé pour `preferredTitle` V7.2).

### Migration GEO interdite

| Contrôle | Résultat |
|---|---|
| Présente sur disque local | Oui |
| Suivie par Git | Non (`.gitignore`) |
| Exclue Docker | Oui (`.dockerignore`) |
| Dans le commit livrable | Doit rester **absente** |
| Action automatique | **Interdite** (ne pas supprimer, ne pas appliquer) |

Les 7 tables GEO historiques en production restent des reliques hors `schema.prisma` actuel — à conserver.

---

## 4. Volume Docker — images

| Élément | Valeur |
|---|---|
| Volume Compose | `featured_images_data` |
| Nom effectif attendu | `naxialis-agent_featured_images_data` (projet Compose `name: naxialis-agent`) |
| Montage | service `app` uniquement → `/app/storage/featured-images` |
| Env | `FEATURED_IMAGE_STORAGE_DIR=/app/storage/featured-images` |
| Utilisateur conteneur | `nextjs` UID/GID **1001** |
| Accès HTTP | uniquement `GET /api/articles/[id]/featured-image/file` + `requireAuth()` |
| Path traversal | rejeté dans `lib/images/storage.ts` |

### Permissions — risque résiduel

Le `Dockerfile` crée et `chown` `/app/storage/featured-images` **dans l’image**, mais un volume nommé **masque** ce répertoire au runtime. Un volume fraîchement créé peut être root:root → écriture `nextjs` en échec (`EACCES`).

**Test non destructif recommandé (VPS, avant bascule) :**

```bash
# Créer le volume sans démarrer la nouvelle app si besoin
docker volume create naxialis-agent_featured_images_data

# Corriger le propriétaire une fois
docker run --rm \
  -v naxialis-agent_featured_images_data:/data \
  alpine chown -R 1001:1001 /data

# Vérifier l’écriture en tant que UID 1001
docker run --rm \
  -u 1001:1001 \
  -v naxialis-agent_featured_images_data:/data \
  alpine sh -c 'touch /data/.write-test && rm /data/.write-test && echo OK'
```

**Sauvegarde / restauration volume :**

```bash
docker run --rm \
  -v naxialis-agent_featured_images_data:/data:ro \
  -v /var/backups/naxialis:/backup \
  alpine tar czf /backup/featured-images-$(date +%F).tar.gz -C /data .
```

Après restauration PostgreSQL, restaurer aussi ce volume pour éviter métadonnées orphelines.

**Interdit :** `docker compose down -v` (effacerait `postgres_data` et `featured_images_data`).

---

## 5. Variables d’environnement nouvelles / optionnelles

| Variable | Obligatoire ? | Défaut | Rôle |
|---|---|---|---|
| `FEATURED_IMAGE_STORAGE_DIR` | Oui en Compose (déjà injectée) | `/app/storage/featured-images` | Racine stockage WebP |
| `OPENAI_IMAGE_MODEL` | Non | `gpt-image-2.5-flare` | Génération image |
| `OPENAI_VISION_MODEL` | Non | `gpt-4.1-mini` | Texte ALT |
| `OPENAI_TITLE_MODEL` | Non | `gpt-4.1-mini` | Suggestions de titres |

Aucune nouvelle clé secrète obligatoire. Les secrets existants (`OPENAI_API_KEY`, WP_*, `AUTH_*`) restent côté serveur uniquement.

---

## 6. Audit fonctionnel V7

### V7.0 — Images

- Génération manuelle via panneau détail / API `…/featured-image/generate`
- ALT soft-fail (échec ALT ≠ échec image)
- Prévisualisation via route fichier authentifiée
- Stockage volume persistant
- Upload WordPress **manuel** uniquement (`…/upload`)
- Locks anti-doublon + réutilisation `wpMediaId`
- Refus d’agir sur article WordPress non-brouillon (contrôle service)

### V7.1 — Auto optionnelle

- Checkbox **off** par défaut (UI `full` uniquement)
- Option absente → comportement historique
- Enfilement **après** brouillon `completed`
- Pas d’upload WordPress automatique
- États persistés (`pending` → `generating` → `ready`/`failed`)
- Reprise boot : requeue des `pending` uniquement ; `generating` interrompu → `failed` explicite (pas de re-facturation aveugle)

### V7.2 — Titres

- 5 suggestions via `/api/titles/suggest` (`gpt-4.1-mini`)
- `full` : bloc inline ; `embedded` (Dashboard) : Dialog + rappel « Titre souhaité »
- Sujet initial intact ; `preferredTitle` dans `editorialContext` JSONB
- Sans sélection → comportement historique strict
- Aucun appel OpenAI au rendu du formulaire / Dashboard

### WordPress / sécurité

- `create_wordpress_draft` inchangé ; drafts uniquement (`status: "draft"`)
- Médias : upload + ALT + `featured_media` sans `publish`
- Routes V7 : toutes protégées par `requireAuth()`
- Pas d’appel OpenAI/WordPress réel pendant cet audit

---

## 7. Résultats des tests (local)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `npx prisma validate` | OK |
| `npm test` | **245** tests · **244** pass · **0** fail · **1** skipped |
| `npx next build --webpack` | OK (warning connu `module.createRequire` dans `lib/db.ts`) |

**Test skipped (attendu) :**  
`crée un brouillon draft avec contenu déjà filtré` — `# SKIP réservé à RUN_EXTERNAL_TESTS=1` (`tests/internal-links-live.test.ts`). Non masqué.

Évolution depuis ~243 pass : ajout des suites V7.0 / V7.1 / V7.2 (images, auto-image, titres + Dialog Dashboard).

---

## 8. Compatibilité V6.1

- Lectures / générations historiques sans `ArticleFeaturedImage` : OK
- `editorialContext` existant : OK ; `preferredTitle` optionnel
- Code GEO applicatif déjà retiré ; tables GEO DB conservées
- Retour simple à l’**ancienne image Docker** : le schéma Prisma V7 **reste** en base si `migrate deploy` a tourné — l’ancienne app peut échouer ou ignorer la table selon le client Prisma embarqué. **Le rollback d’image ne restaure pas automatiquement PostgreSQL.**

---

## 9. Risques

| Risque | Sévérité | Mitigation |
|---|---|---|
| Volume images non inscriptible (UID 1001) | Haute | Test `touch` + `chown 1001:1001` avant bascule |
| Build depuis workspace local avec GEO drop | Critique | Déployer depuis `git archive` / checkout propre ; `.dockerignore` en filet |
| `migrate deploy` au boot sans inventaire préalable | Haute | Lister `_prisma_migrations` avant |
| Rollback image sans restore DB | Haute | Procédure §11 |
| Coûts OpenAI image / titres | Moyenne | Option image off par défaut ; modèle mini pour titres |
| Métadonnées orphelines si volume non restauré | Moyenne | Backup joint PG + volume |

---

## 10. Plan de sauvegarde (avant déploiement)

1. **PostgreSQL** (conteneur `postgres`) :

```bash
docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > /var/backups/naxialis/pg-v6.1-$(date +%F-%H%M).dump
```

2. **Code / compose** sur VPS : archive du répertoire `/opt/naxialis-content-agent` (sans `.env` dans les copies non sécurisées ; conserver `.env` à part).

3. **Volume images** : après création du volume V7, l’inclure dans les backups réguliers (commande §4). Avant première création, rien à sauvegarder côté images.

4. Contrôle d’intégrité du dump (`pg_restore -l` / taille non nulle).

---

## 11. Procédure de déploiement (à exécuter plus tard — pas maintenant)

1. Remplir conditions C1–C7.  
2. Copier l’archive Git sur le VPS (rsync/scp), extraire dans un staging, comparer.  
3. Vérifier `.env` (pas besoin de nouvelles clés obligatoires).  
4. Préparer / chown le volume `featured_images_data`.  
5. `docker compose build` puis `docker compose up -d` (**sans** `-v`).  
6. Suivre logs `app` : `[boot] migrate` → application des **2** migrations V7 → `[boot] ready`.  
7. Contrôler `_prisma_migrations` = 17 entrées.  
8. Smoke : login, `/articles/new` (titres + option image), Dashboard Dialog titres, génération image manuelle, pas d’upload WP auto.  

---

## 12. Procédure de retour arrière

### A. Avant `migrate deploy` (image non démarrée / migrate non appliqué)

- Revenir à l’archive / image V6.1 (`283e424`) et `up -d`.  
- Volume images vide : ignorable.

### B. Après `migrate deploy` (schéma V7 en base)

1. **Arrêter** la nouvelle app.  
2. **Restaurer PostgreSQL** depuis le dump V6.1 (le simple rollback d’image **ne suffit pas**).  
3. Redémarrer l’image / code V6.1.  
4. Conserver le volume `featured_images_data` (données inoffensives pour V6.1) ou le laisser orphelin ; **ne pas** `-v` si `postgres_data` doit survivre.  
5. Vérifier login + génération article sans module image.

### C. Point critique

> Le retour à l’ancienne image Docker **ne restaure pas** automatiquement la base. Sans restore du dump, le client Prisma V6.1 peut cohabiter avec une table `ArticleFeaturedImage` (souvent toléré) mais l’état `_prisma_migrations` et d’éventuelles écritures V7 resteront — d’où l’obligation du dump préalable.

---

## 13. Synthèse exécutive

- Livrable V7.0 + V7.1 + V7.2 prêt en local, tests verts.  
- 2 migrations additives ; GEO drop hors artefact.  
- Volume images déclaré ; permissions UID 1001 à valider sur VPS.  
- Tag `v7.2.0` proposé, **non créé**.  
- **Aucun déploiement réalisé dans cet audit.**
