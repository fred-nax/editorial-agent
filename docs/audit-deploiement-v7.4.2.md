# Audit de déploiement — Naxialis Content Agent V7.4.2

**Date :** 2026-11-11  
**Périmètre :** audit local + livrable Git reproductible (V7.3 + V7.4 + V7.4.1 + V7.4.2).  
**Interdit dans cet audit :** déploiement VPS, modification PostgreSQL, `docker compose down -v`, redémarrage Docker production, push distant, création automatique du tag, transfert d’archive vers le VPS.

**Cible production connue :** `https://agent.naxialis.com` · `/opt/naxialis-content-agent` · Docker Compose · reverse proxy `jwilder/nginx-proxy`.  
**Baseline production :** **V7.2** · commit **`8905075`** (docs pin) / code V7.2 **`e076856`** · **17** migrations Prisma appliquées · tables GEO historiques **conservées**.

---

## Décision finale

### **GO sous conditions**

La release locale V7.4.2 est cohérente (typecheck, `prisma validate`, tests, build webpack). **Aucune nouvelle migration Prisma** n’est introduite depuis V7.2. La migration GEO destructive reste **hors Git / hors Docker / hors archive**. Aucun secret n’a été détecté dans le livrable candidat. Docker Compose (volumes, UID 1001, `migrate deploy`) est inchangé structurellement.

| Condition | Obligatoire avant GO production |
|---|---|
| C1 | Déployer **uniquement** depuis le commit / archive Git ci-dessous (pas depuis un workspace sale contenant le dossier GEO drop). |
| C2 | Vérifier l’archive / le contexte Docker : **absence** de `20261103173400_drop_ai_visibility_monitor`. |
| C3 | Inventaire VPS de `_prisma_migrations` **avant** rebuild (doit lister les **17** migrations V7.2). |
| C4 | Sauvegarde PostgreSQL + fichiers applicatifs + volume `naxialis-agent_featured_images_data`. |
| C5 | Vérifier lisibilité des sauvegardes avant bascule. |
| C6 | Recréer **uniquement** le service `app` (ne jamais `docker compose down -v`). |
| C7 | Tag proposé `v7.4.2` à créer **manuellement** après validation du SHA. |
| C8 | Contrôler smoke V7.3 (file) + V7.4.2 (rapprochements) + V7.0–V7.2 (images / titres) après bascule. |

**NO-GO immédiat** si l’artefact contient la migration GEO drop, si `_prisma_migrations` diverge de l’attendu (≠ 17), ou si le volume images n’est pas accessible en écriture par UID 1001.

---

## 1. Commit candidat

| Élément | Valeur |
|---|---|
| Branche | `feat/dashboard-shadcn` |
| Baseline production | `8905075` — *docs: pin V7.2 deployment audit to commit e076856* |
| Code V7.2 sous-jacent | `e076856` — *Ship V7.0-V7.2 featured images, optional auto image, and title suggestions.* |
| Commit livrable (code V7.3–V7.4.2) | **`7339aab1d8cd6e83f54aadbc3421c4728bc03a1d`** (`7339aab`) |
| Message | `Release V7.4.2 editorial queue and similarity improvements` |
| Commit docs (pin + notes) | **`59e3fe3`** (HEAD audit) — suite de `4dcea6b` |
| Tag proposé (non créé) | `v7.4.2` — à poser sur **`7339aab`** (code) ; archive recommandée depuis **HEAD docs** (`59e3fe3` ou ultérieur) |
| Archive locale vérifiée | `naxialis-v7.4.2-59e3fe3.tar.gz` (17 migrations, GEO drop absent) |
| Remote local | Aucun remote configuré dans cet environnement (pas de push effectué). |

### Archive reproductible

```bash
# Depuis le commit livrable (working tree propre)
git rev-parse HEAD
git archive --format=tar.gz -o naxialis-v7.4.2-$(git rev-parse --short HEAD).tar.gz HEAD

# Contrôles obligatoires sur l’archive
tar -tzf naxialis-v7.4.2-*.tar.gz | findstr /I "drop_ai_visibility_monitor"
# → aucune ligne attendue

tar -tzf naxialis-v7.4.2-*.tar.gz | findstr /I "editorial-similarity\|EditorialRapprochement\|editorial-queue-v73\|editorial-intentions\|20261111140000\|20261111160000"
# → chemins V7.3–V7.4.2 + migrations V7.0/V7.1 présents

tar -tzf naxialis-v7.4.2-*.tar.gz | findstr /I "prisma/migrations/"
# → exactement 17 migration.sql (+ migration_lock.toml)

tar -tzf naxialis-v7.4.2-*.tar.gz | findstr /I "\.env$\|storage/featured-images/.*\.webp\|node_modules\|\.next/"
# → aucune ligne attendue
```

**Ne pas** inclure : `.env`, `node_modules`, `.next`, images locales sous `storage/featured-images/*`, dumps, caches, migration GEO drop.

---

## 2. Fichiers livrés (depuis `8905075`)

### Distinctions par version

| Version | Nature | Impact schéma |
|---|---|---|
| **V7.3** | File éditoriale (édition, priorités, filtres, archive, suppression sécurisée, `topicId` → `/articles/new`) | Aucune migration |
| **V7.4** | Rapprochements éditoriaux locaux + panneau UI + mode `editorial` sur `check-duplicates` + analyse IA facultative | Aucune migration |
| **V7.4.1** | Concepts composés, domaines, pondération anti faux positifs PHP/WP | Aucune migration |
| **V7.4.2** | Intentions éditoriales + décodage entités HTML WordPress | Aucune migration |

### Modifiés

- `.env.example` — commentaire optionnel `OPENAI_SIMILARITY_MODEL`
- `app/(protected)/articles/new/page.tsx` — `topicId`, panneau rapprochement
- `app/(protected)/dashboard/page.tsx` — intégration compacte rapprochement
- `app/(protected)/topics/page.tsx` — file + rapprochement
- `app/api/topics/[id]/route.ts` — PATCH / DELETE V7.3
- `app/api/topics/check-duplicates/route.ts` — dual mode `proposals` + `editorial`
- `components/ArticleForm.tsx` — panneau rapprochement + titres V7.2
- `components/TopicQueue.tsx` — actions file V7.3 + AlertDialog
- `components/dashboard/topic-preview.tsx` — lien / navigation
- `components/navigation.ts` — libellés navigation
- `lib/agent/internal-links/catalog.ts` — `decodeHtmlEntities` partagé
- `lib/seo/normalize.ts` — `decodeHtmlEntities` + `stripHtml` enrichi

### Créés

- `app/api/topics/analyze-similarity/route.ts`
- `components/EditorialRapprochementPanel.tsx`
- `components/ui/alert-dialog.tsx`
- `lib/topics/delete.ts`
- `lib/topics/editorial-concepts.ts`
- `lib/topics/editorial-intentions.ts`
- `lib/topics/editorial-similarity.ts`
- `lib/topics/editorial-similarity-ai.ts`
- `lib/topics/editorial-similarity-config.ts`
- `lib/topics/editorial-similarity-locks.ts`
- `lib/topics/editorial-similarity-types.ts`
- `tests/editorial-queue-v73.test.ts`
- `tests/editorial-rapprochement-v74.test.ts`
- `tests/editorial-rapprochement-v741.test.ts`
- `tests/editorial-rapprochement-v742.test.ts`
- `docs/audit-deploiement-v7.4.2.md`

### Explicitement exclus du livrable

- `prisma/migrations/20261103173400_drop_ai_visibility_monitor/` (présent sur disque local, **gitignored + dockerignored**)
- Images WebP locales sous `storage/featured-images/**`
- `.env`, secrets, archives `*.tar.gz`, `node_modules`, `.next`

### Dépendances

- `package.json` / `package-lock.json` : **inchangés** (aucune dépendance ajoutée pour V7.3–V7.4.2).

---

## 3. Migrations Prisma

### Inventaire attendu en production après déploiement : **17** (identique à V7.2)

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
15. `20261111100000_article_generation_editorial_context`
16. `20261111140000_article_featured_image`
17. `20261111160000_featured_image_auto_request`

**Nouvelles migrations V7.3–V7.4.2 :** aucune.  
`prisma migrate deploy` au démarrage doit donc être un **no-op** si la V7.2 est déjà déployée correctement.

### Migration GEO interdite

| Contrôle | Résultat |
|---|---|
| Présente sur disque local | Oui |
| Suivie par Git | Non (`.gitignore`) |
| Exclue Docker | Oui (`.dockerignore`) |
| Dans le commit / archive | Doit rester **absente** |
| Action automatique | **Interdite** |

Les 7 tables GEO historiques en production restent des reliques hors `schema.prisma` actuel — à conserver.

### Compatibilité données

- Modèles `Topic`, `ArticleGeneration`, `WordPressPost`, `ArticleFeaturedImage`, SEO : inchangés depuis V7.2.
- `editorialContext` JSONB : continue d’accueillir `preferredTitle` (V7.2) ; aucun champ Prisma nouveau pour V7.3–V7.4.2.
- Lien Topic ↔ ArticleGeneration via `topicId` string : pas de cascade Prisma (suppression sujet bloquée si génération liée).

---

## 4. Audit Docker

| Élément | État vs V7.2 |
|---|---|
| `Dockerfile` | Inchangé (UID 1001, `/app/storage/featured-images`, Prisma copy) |
| `docker-compose.yml` | Inchangé (`postgres_data`, `featured_images_data`, réseaux) |
| `.dockerignore` | Conserve exclusion GEO drop |
| `scripts/docker-start.mjs` | `prisma migrate deploy` puis `server.js` |
| Secrets dans l’image | Non (`.env` dockerignored ; placeholders build uniquement) |

Volumes **non renommés**. Aucune dépendance Docker supplémentaire.

---

## 5. Variables d’environnement

| Variable | Obligatoire ? | Défaut | Rôle |
|---|---|---|---|
| `OPENAI_SIMILARITY_MODEL` | Non | `gpt-4.1-mini` | Analyse IA facultative des rapprochements |
| `FEATURED_IMAGE_STORAGE_DIR` | Oui en Compose (déjà injectée) | `/app/storage/featured-images` | Stockage images V7 |
| `OPENAI_IMAGE_MODEL` / `VISION` / `TITLE` | Non | inchangés V7.2 | Images / ALT / titres |

Aucune nouvelle clé secrète obligatoire. Les secrets existants restent côté serveur uniquement.

---

## 6. Audit fonctionnel

### V7.3 — File éditoriale (revue code + tests)

- Édition sujet / priorité (PATCH pending)
- Filtres file, AlertDialog suppression
- Suggestions titres V7.2 conservées
- Rédaction depuis sujet (`topicId` → `/articles/new`)
- Archivage ; blocage suppression si génération liée ou `generating` / `completed`
- Pas de cascade sur `ArticleGeneration` / brouillons WordPress
- Accès article depuis sujet terminé

### V7.4 → V7.4.2 — Rapprochements

- Moteur local déterministe vs `WordPressPost` `status: "publish"`
- Route `/api/topics/check-duplicates` : mode `proposals` (veille) **et** `editorial`
- UI : File, Nouvel article, Dashboard (compact)
- Concepts / synonymes / domaines (V7.4.1) + **intentions** (V7.4.2)
- Exclusion faux positifs PHP / sessions WP / classements IA sans intention
- Classes : doublon probable / proche / complémentaire ; pas de remplissage artificiel à 5
- Analyse IA : déclenchement explicite uniquement ; refuse liste vide ; ne réintroduit pas hors candidats locaux
- Décodage HTML (`&rsquo;`, `&#8217;`, `&amp;`, …) sans `dangerouslySetInnerHTML`
- Avertissement inventaire obsolète conservé
- Sync inventaire : non déclenchée pendant cet audit

### Compatibilité V7.2 (production actuelle)

- Génération articles, titres, images auto/manuelle, ALT, stockage, upload WP manuel
- Historique, paramètres, veille, SEO/GEO
- `create_wordpress_draft` et statut `draft` inchangés
- Agent OpenAI / instructions permanentes non modifiés

---

## 7. Résultats des tests (local)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `npx prisma validate` | OK |
| `npm test` | **292** tests · **291** pass · **0** fail · **1** skipped |
| `npx next build --webpack` | OK (warning connu `module.createRequire` dans `lib/db.ts`) |

**Test skipped (attendu) :**  
`crée un brouillon draft avec contenu déjà filtré` — `# SKIP réservé à RUN_EXTERNAL_TESTS=1` (`tests/internal-links-live.test.ts`). Non masqué.

Référence V7.4.2 : 291 pass / 0 fail / 1 skipped — **conforme**.

---

## 8. Stratégie de sauvegarde volume image

```bash
docker run --rm \
  -v naxialis-agent_featured_images_data:/data:ro \
  -v /var/backups/naxialis:/backup \
  alpine tar czf /backup/featured-images-$(date +%F).tar.gz -C /data .
```

Après restauration PostgreSQL, restaurer aussi ce volume pour éviter métadonnées orphelines `ArticleFeaturedImage`.

**Interdit :** `docker compose down -v`.

---

## 9. Risques

| Risque | Niveau | Mitigation |
|---|---|---|
| Contaminer l’artefact avec GEO drop (présent sur disque) | Élevé | Archive Git uniquement ; contrôle `findstr drop_ai_visibility` |
| Faux sentiment « schéma à migrer » | Faible | Confirmer 17 migrations déjà appliquées → `migrate deploy` no-op |
| Inventaire WordPress obsolète → rapprochements incomplets | Moyen | Affichage `inventoryStale` ; sync manuelle post-déploiement si besoin |
| Coût OpenAI similarité | Faible | Opt-in UI uniquement ; défaut `gpt-4.1-mini` |
| Permissions volume images UID 1001 | Moyen (hérité V7.2) | Test écriture non destructif avant bascule |
| Rollback image sans restore DB | Faible ici | Aucune migration nouvelle ; rollback image V7.2 possible sans downgrade schéma |

---

## 10. Procédure de déploiement (à exécuter plus tard — hors scope)

1. Vérifier production V7.2 (commit/image, HTTPS, santé `app` + `postgres`).
2. Vérifier `_prisma_migrations` = **17** entrées attendues.
3. Vérifier présence des **7 tables GEO** historiques.
4. Sauvegarder PostgreSQL (`pg_dump`).
5. Sauvegarder fichiers applicatifs `/opt/naxialis-content-agent` (hors `node_modules` / `.next` si souhaité).
6. Sauvegarder volume `naxialis-agent_featured_images_data`.
7. Vérifier lisibilité des sauvegardes.
8. Transférer l’archive Git validée (étape ultérieure).
9. Contrôler contenu archive sur VPS (GEO drop absent, 17 migrations, chemins V7.3–V7.4.2).
10. Synchroniser fichiers **sans** `--delete`, **préserver `.env`**.
11. `docker compose build app`.
12. Contrôler migrations **dans l’image** (`docker compose run --rm --entrypoint … ls prisma/migrations` — pas de GEO drop).
13. Recréer **uniquement** `app` : `docker compose up -d --no-deps --force-recreate app`.
14. Vérifier logs `migrate deploy` (no-op attendu), PostgreSQL, tables GEO, volumes, HTTPS.
15. Smoke tests : login, file V7.3, rapprochement V7.4.2, titres V7.2, image V7.0/V7.1, génération draft.

### Interdictions

- `docker compose down -v`
- `prisma migrate reset`
- Suppression des volumes
- `rsync --delete`
- Application de `20261103173400_drop_ai_visibility_monitor`

---

## 11. Retour arrière applicatif

1. Redeployer l’image / archive **V7.2** (`e076856` / tag `v7.2.0` si créé).
2. Recréer uniquement le service `app` (mêmes volumes).
3. **Pas de downgrade Prisma nécessaire** (aucune migration V7.3–V7.4.2).
4. Si restauration PostgreSQL : restaurer aussi le volume images.
5. Vérifier HTTPS + smoke V7.2.

Les données créées sous V7.3 (sujets édités / archivés) restent en base et restent compatibles V7.2. Les rapprochements V7.4 sont purement applicatifs (pas de table dédiée).

---

## 12. Décision

**GO sous conditions** — release V7.4.2 reproductible, sans migration nouvelle, protections GEO en place, tests verts. Déploiement VPS **non effectué** dans cet audit.
