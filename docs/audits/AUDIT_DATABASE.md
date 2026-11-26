# Audit PostgreSQL / Prisma — V7.16.0

Baseline : `v7.15.1` · base contrôlée : **`naxialis_agent`**.

---

## Contrôles réalisés

| Contrôle | Résultat |
|----------|----------|
| `current_database()` | `naxialis_agent` |
| `npx prisma validate` | OK |
| `npx prisma migrate status` | **Database schema is up to date** (37 migrations) |
| Modèles Prisma | **27** |
| Compteurs clés | gens 16 · images 10 · events 4 · WP posts 119 · WebflowCmsItem 5 · topics 9 · GscPageDailyStat 1582 · Ga4PageDailyStat 640 |
| Intégrité cross-workspace | 0 mismatch event/image |
| Events V7.15.1 | 4 coûts exacts (0.136369 / 0.01 / 0.011305 / 0.00115) |
| Webflow hist. | 0.312712 + 0.405335 + 0.305210 = **1.023257** |
| Garde migtest | `lib/db.ts` `assertApplicationDatabaseAllowed` |
| Tables GEO AI Visibility | **absentes** (migration `drop_ai_visibility` **présentée** dans `_prisma_migrations`) |

---

## Relations / onDelete (extrait)

- `ArticleGeneration` → workspace **Restrict** (pas de suppression workspace accidentelle via gen).
- `ArticleFeaturedImage` → generation **Cascade**.
- `OpenAiUsageEvent` → generation / image **SetNull** (conserve l’historique de coût).
- `WorkspaceCmsSettings` → workspace **Cascade**.
- Stats Google → connection **Cascade** ; workspace souvent **SetNull**.

---

## Constats

### INFRA-001 — P2 — Confiance haute

- **Description :** la migration historique `drop_ai_visibility_monitor` figure comme **appliquée** ; les 7 tables GEO ne sont plus présentes.
- **Impact :** une réapplication destructive serait catastrophique si rejouée à tort sur un environnement où elles existent encore / backups.
- **Preuve :** `dropAiVisibilityApplied: true` ; `geoLikeTables` sans tables métier GEO.
- **Correction :** runbook « ne jamais réappliquer » ; contrôles CI/deploy ; backups avant migrate.
- **Version :** V7.16.3 · complexité F (process) / M (garde deploy).

### DB-001 — INFO

- Client Prisma token V7.15.1 + reload — leçon V7.14.1 prise en compte.
- Decimal `OpenAiUsageEvent.estimatedCostUsd` précision 18,8.

### DB-002 — P3

- `onDelete: Cascade` image←génération : suppression d’article efface fichiers liés en DB (fichiers disque à vérifier ops).

### DB-003 — P2 — Confiance haute

- **Description :** `recordOpenAiUsageEvent` n’vérifie pas que `generationId` / `featuredImageId` appartiennent au `workspaceId` fourni (défense en profondeur).
- **Preuve :** revue tracker ([Prisma schema workspace audit](51c9d80c-7811-489d-8317-7c51a13db664)).
- **Impact :** croisement workspace possible uniquement via bug d’appelant interne (pas d’IDOR HTTP démontré).
- **Version :** V7.16.1 · complexité F–M.

### DB-004 — P2 — Confiance haute

- **Description :** écritures `update`/`delete` par `id` seul après `findFirst` scopé (`research-configs`, `custom-themes`, veille, etc.) — sûres aujourd’hui, fragiles si un appelant omet le pré-check.
- **Contre-exemple correct :** `topics/[id]` avec `where: { id, workspaceId }`.
- **Version :** V7.16.2 · complexité M.

### DB-005 — P2 — Confiance moyenne

- **Description :** unicité des stats GSC/GA **sans** `workspaceId` — collision si deux espaces partageaient la même propriété Google.
- **Impact :** faible tant qu’une propriété = un workspace (état actuel).
- **Version :** V7.16.2 / doc ops · complexité M.

### INFRA-004 — P2 — Confiance haute

- **Description :** le dossier migration `drop_ai_visibility_monitor` est **exclu** du dépôt (`.gitignore` / `.dockerignore`) ; les migrations de **création** GEO restent versionnées.
- **Impact :** base **neuve** clonée depuis Git peut **recréer** des tables `Visibility*` orphelines sans drop correspondant ; en prod historique le drop est déjà dans `_prisma_migrations`.
- **Correction :** runbook « migrate neuve » + test CI schéma final sans tables GEO ; ne jamais réintroduire le drop destructif à la légère.
- **Version :** V7.16.3 · complexité M.

---

## Limitations

- Pas de `EXPLAIN ANALYZE` systématique.
- Pas de restauration testée (voir BACKUP_RESTORE).
- Lecture seule — aucune correction de données.
