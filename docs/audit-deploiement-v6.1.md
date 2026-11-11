# Audit de déploiement — Naxialis Content Agent V6.1

**Date :** 2026-11-11  
**Périmètre :** audit **lecture seule** (aucune migration, aucun déploiement, aucun reset, aucune modification Docker / `.env` / secrets).  
**Cible production connue :** `https://agent.naxialis.com` · VPS · `/opt/naxialis-content-agent` · Docker Compose (`app` + `postgres`) · reverse proxy `jwilder/nginx-proxy`.

---

## Décision finale

### **GO sous conditions**

La V6.1 est **techniquement cohérente** en local (typecheck, Prisma validate, tests, build webpack OK).  
Le déploiement **ne doit pas** partir de l’arbre de travail actuel sans contrôles d’artefact, car un risque **critique** persiste autour de la migration GEO destructive et de l’état non commité.

| Condition | Obligatoire avant GO production |
|---|---|
| C1 | Créer un **commit / tag de livraison** contenant tout le code V4–V6.1 **et** uniquement la migration additive `20261111100000_article_generation_editorial_context`. |
| C2 | Garantir que `20261103173400_drop_ai_visibility_monitor` est **absente** de l’artefact (git, archive, contexte Docker). Vérification listée en §F. |
| C3 | Ajouter (ou vérifier) l’exclusion Docker de cette migration (aujourd’hui absente de `.dockerignore` alors qu’elle n’est que dans `.gitignore`). |
| C4 | Sur le VPS : inventaire réel de `_prisma_migrations` **avant** tout redémarrage `app` (non vérifié dans cet audit). |
| C5 | Sauvegarde PostgreSQL complète + contrôle d’intégrité **avant** `migrate deploy`. |
| C6 | Confirmer que le seul SQL nouveau appliqué sera `ADD COLUMN … editorialContext JSONB`. |

**NO-GO immédiat** si l’image / l’archive contient le dossier `20261103173400_drop_ai_visibility_monitor` ou si le démarrage Docker applique des migrations non inventoriées.

---

## A. État du projet

### Git

| Élément | Valeur constatée |
|---|---|
| Branche | `feat/dashboard-shadcn` |
| HEAD | `319831e83204591940b1895e205d09031e004330` |
| Message | `Ship Veille V1.x, generation traces, and editorial duplicate detection.` |
| Date commit | 2026-11-07 20:57:44 +0100 |
| Remote | **Aucun remote** configuré dans cet environnement local |
| Working tree | **Sale** : nombreuses modifications non commitées + fichiers non suivis (Dashboard V3–V5, nav V4, V6/V6.1, shadcn/ui) |

Le commit `319831e` correspond à la **V1.6 (Veille)** déjà préparée.  
La V6/V6.1 (préparation éditoriale, UI Dashboard/nav, `editorialContext`) **n’est pas encore figée** dans un commit livrable.

### Versions locales (package.json)

| Dépendance | Version déclarée |
|---|---|
| Next.js | `^16.3.8` |
| React / React DOM | `^19.3.0` |
| TypeScript | `^7.0.2` |
| Tailwind CSS | `^4.3.3` |
| Prisma / `@prisma/client` | `^7.10.0` |
| next-auth | `^5.0.0-beta.32` |
| openai | `^7.25.0` |
| `@base-ui/react` | `^1.9.0` |
| lucide-react | `^1.70.0` |

Application `package.json` : `"version": "1.0.0"` (pas de bump semver produit).

### Modifications non commitées (extrait)

**Modifiées :** `ArticleForm`, `AppShell`/`Sidebar`/`Header`, Dashboard, `generate` API, `generation.ts`, `build-generation-context.ts`, `generation-report.ts`, `prisma/schema.prisma` (`editorialContext`), tests, `package.json` / lock.

**Non suivies (exemples) :** `lib/editorial-context.ts`, `components/ui/*`, `components/dashboard/*`, `components/MobileNav.tsx`, `components/EditorialContextPanel.tsx`, `prisma/migrations/20261111100000_article_generation_editorial_context/`, `tests/editorial-context.test.ts`, archive `naxialis-release-319831e.tar.gz`.

---

## B. Migrations Prisma

### Inventaire disque local (`prisma/migrations/`)

| Migration | Nature | Suivie Git |
|---|---|---|
| `20261002103326_init` … `20261107191000_editorial_watch_search` | Historique V1.x / SEO / GEO create / Veille | Oui (dans `319831e`) |
| `20261103173400_drop_ai_visibility_monitor` | **Destructive GEO** | **Non** (`.gitignore`) mais **présente sur disque** |
| `20261111100000_article_generation_editorial_context` | Additive V6 | **Non suivie** (`??`) |

### Migration destructive GEO — détail

Fichier : `prisma/migrations/20261103173400_drop_ai_visibility_monitor/migration.sql`

**Effets SQL :**
- `DROP CONSTRAINT` sur FKs Visibility*
- `DROP TABLE` : `VisibilityBrand`, `VisibilityCampaign`, `VisibilityQuestion`, `VisibilityResponse`, `VisibilityEntity`, `VisibilityMention`, `VisibilityCitation`
- `DROP TYPE` : enums Visibility*

**Commentaires dans le SQL :** « NOT APPLIED », « Do not apply until explicit authorization ».

**Git :**
- Entrée `.gitignore` : `prisma/migrations/20261103173400_drop_ai_visibility_monitor/`
- **Absente** de `git ls-files` et du commit `319831e`

**Docker (point critique) :**
- `.dockerignore` **n’exclut pas** ce dossier.
- `Dockerfile` fait `COPY . .` puis copie `prisma/` dans l’image runner.
- `scripts/docker-start.mjs` exécute **`prisma migrate deploy`** à **chaque démarrage** du conteneur `app`.

**Conséquence :** un `docker compose build` depuis **ce workspace local** (où le dossier GEO drop existe) **embarquerait** la migration destructive, et le prochain démarrage production l’appliquerait si elle n’est pas déjà dans `_prisma_migrations`.  
Un build depuis un **checkout Git propre** (où le dossier est absent) ne l’embarque pas.

**Dépendances chronologiques :**
- Les migrations GEO *create* (`20261028230000`, `20261030190000`, `20261030194500`) restent dans le dépôt.
- Les migrations postérieures (`topic_veille_source`, `trace`, `editorial_watch_search`, `editorial_context`) **ne dépendent pas** du drop GEO.
- Le `schema.prisma` applicatif **ne contient plus** les modèles Visibility* (code GEO retiré) : les tables GEO en production, si présentes, sont des **reliques DB** hors modèle Prisma actuel — à **conserver** tant que le drop n’est pas autorisé.

### Migration V6 `editorialContext`

Fichier : `prisma/migrations/20261111100000_article_generation_editorial_context/migration.sql`

```sql
ALTER TABLE "ArticleGeneration" ADD COLUMN IF NOT EXISTS "editorialContext" JSONB;
```

| Critère | Statut |
|---|---|
| Uniquement `editorialContext` | Oui |
| JSONB | Oui |
| Nullable (pas de `NOT NULL`) | Oui |
| Additive / non destructive | Oui |
| Compatible anciennes générations | Oui (`null`) |
| Alignée `schema.prisma` (`editorialContext Json?`) | Oui |
| Migration supplémentaire pour V6.1 (`language`, custom audience/objective) | **Non requise** (JSON) |

### État local vs production

| Environnement | Constat |
|---|---|
| **Local (Laragon)** | `prisma migrate deploy` a déjà été exécuté précédemment : drop GEO **et** `editorialContext` **appliqués** en local (historique de session). Cet audit **n’a pas** relancé de migrate. |
| **Production** | **Non accessible / non vérifié** dans cet audit. Ne pas supposer l’état de `_prisma_migrations` ni la présence des tables GEO. |

### Vérifications VPS encore nécessaires (preuve obligatoire)

Sur le serveur, **avant** rebuild :

```bash
# Exemples — à exécuter manuellement sur le VPS, hors de cet audit
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at;'

docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "\dt Visibility*"

docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "\d \"ArticleGeneration\""
```

Attendu pour un déploiement sûr V6.1 :
- `20261103173400_drop_ai_visibility_monitor` **absent** de `_prisma_migrations` (ou explicitement décidé autrement — hors scope).
- Tables `Visibility*` **présentes** si la politique est de les conserver.
- Colonne `editorialContext` **absente** avant migrate, **présente** après apply contrôlé de `20261111100000_…` uniquement.

---

## C. Compatibilité applicative

### Agent OpenAI

- Session : `lib/agent/run-session.ts` continue d’utiliser `agent_id: env.OPENAI_AGENT_ID`.
- Les indications V6/V6.1 passent par `generationMessage` / `buildGenerationMessage` (contexte **utilisateur**), pas via `agents.update` hors UI Paramètres.
- `lib/agent/prompt.ts` et le schéma tool `create_wordpress_draft` (`lib/agent/tools.ts`) : **non altérés** pour imposer une publication.
- Sujet seul + langue « agent » → message dynamique **identique** à l’historique.
- Contexte **veille** reste prioritaire (`transmitsVeilleContext`).

### WordPress

- `lib/wordpress.ts` : `status: "draft" as const` conservé.
- Tool `create_wordpress_draft` : paramètres inchangés (title, content, excerpt, slug, meta_*).
- Aucune publication automatique introduite par V6.1.

### Auth.js

- Routes protégées / `requireAuth` sur `/api/generate` : inchangé dans le principe.
- Pas de modification des secrets / Auth.js dans le périmètre V6.1.

### Prisma

- Champ `editorialContext Json?` + migration additive.
- Client généré localement cohérent avec le schéma.
- Risque de dérive : schéma sans modèles GEO + tables GEO encore en prod = **acceptable** si le drop n’est pas appliqué.

### Frontend (shadcn/ui + Base UI)

- Navigation V4 (sidebar claire, collapse, Sheet mobile), Dashboard V3–V5, formulaire Nouvel article V6/V6.1.
- Selects langue / public / objectif ; inputs conditionnels « Autre » ; Accordion options avancées.
- Boutons liens : `nativeButton={false}` conservé là où `render` + Link/`a`.
- UI reste en français ; la langue choisie n’i18n pas l’interface.
- Risques UX modérés : Select Base UI (focus/clavier) à revalider manuellement en prod ; carte Dashboard embarque le formulaire enrichi en mode `embedded`.

---

## D. Tests (exécutés pendant cet audit — non destructifs)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | **OK** (`tsc --noEmit`) |
| `npx prisma validate` | **OK** |
| `npm test` (sans `RUN_EXTERNAL_TESTS`) | **208 pass**, 1 skip, 0 fail |
| `npx next build --webpack` | **OK** (warnings préexistants `createRequire` / `lib/db.ts`) |

**Non exécuté (interdit) :** `prisma migrate deploy`, `migrate dev`, `db push`, `docker compose up`, appels OpenAI/WordPress réels, reset.

---

## E. Risques

### Critique

1. **Migration GEO drop embarquée via Docker build local**  
   Présente sur disque + non listée dans `.dockerignore` + `migrate deploy` au boot → **perte irréversible** des tables Visibility* en production.

2. **Redémarrage `app` = apply automatique des migrations du dossier image**  
   Tout oubli de contrôle d’artefact avant `compose up` est destructeur potentiel.

### Élevé

3. **Working tree non figé** : déploiement depuis fichiers locaux non commités → non reproductible, risque d’omettre / d’inclure le mauvais set de migrations.  
4. **État `_prisma_migrations` production non vérifié** dans cet audit.  
5. **Rollback conteneur ≠ rollback schéma** après apply de `editorialContext` (additive, mais irréversible sans script manuel).

### Modéré

6. Génération depuis la file : `angle`/`notes` Topic hors veille sont maintenant transmis comme indications (changement V6 volontaire).  
7. Textes libres public/objectif : surface d’injection prompt mitigée (sanitisation + cadrage « préférences »), à surveiller.  
8. Package `cn` npm utilisé par shadcn généré (en plus de `@/lib/utils`) — dette mineure, build OK.

### Faible

9. Warnings webpack `createRequire` sur `lib/db.ts`.  
10. Collapse sidebar non persisté.  
11. Archive `naxialis-release-319831e.tar.gz` locale = V1.6, **pas** V6.1.

---

## F. Plan de déploiement (documenté, **non exécuté**)

Adapté à `/opt/naxialis-content-agent` · Compose existant · `AUTH_URL=https://agent.naxialis.com`.

### 1. Figement Git

- Committer / tagger explicitement V6.1 (ex. `v6.1.0`).
- Inclure `20261111100000_article_generation_editorial_context`.
- **Ne jamais** committer `20261103173400_drop_ai_visibility_monitor`.
- Vérifier : `git ls-files prisma/migrations | findstr drop_ai_visibility` → vide.

### 2. Artefact sûr

Préférer un **checkout propre** du tag (pas le dossier de travail Windows avec le drop GEO).

Avant archive / rsync / build :

```bash
# Depuis la racine du tag checkouté
test ! -d prisma/migrations/20261103173400_drop_ai_visibility_monitor
ls prisma/migrations | sort
# Doit lister … editorial_watch_search puis editorial_context ; PAS drop_ai_visibility
```

**Recommandation forte :** ajouter dans `.dockerignore` (changement à faire **avant** build, hors exécution de cet audit) :

```
prisma/migrations/20261103173400_drop_ai_visibility_monitor
```

### 3. Sur le VPS — sauvegardes

```bash
cd /opt/naxialis-content-agent
TS=$(date -u +%Y%m%dT%H%M%SZ)

# Sauvegarde fichiers app (hors node_modules/.next si présents)
sudo tar -czf "/root/backups/naxialis-app-$TS.tgz" \
  --exclude='./.next' --exclude='./node_modules' .

# Sauvegarde PostgreSQL
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "/root/backups/naxialis-pg-$TS.dump"

# Vérifier dump non vide
ls -lh "/root/backups/naxialis-pg-$TS.dump"
pg_restore -l "/root/backups/naxialis-pg-$TS.dump" | head
```

Préserver `.env` et volume `postgres_data` (ne pas supprimer le volume).

### 4. Inventaire migrations **avant** rebuild

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SELECT migration_name FROM "_prisma_migrations" ORDER BY started_at;'
```

Comparer à la liste embarquée dans le futur contexte de build.

### 5. Build contrôlé

```bash
# Après déploiement des sources du tag (sans drop GEO)
docker compose build app

# Contrôle image : la migration drop ne doit PAS exister
docker compose run --rm --entrypoint sh app -c \
  'ls prisma/migrations | sort; test ! -d prisma/migrations/20261103173400_drop_ai_visibility_monitor'
```

### 6. Apply migration V6 uniquement (option contrôle fin)

Si l’on veut éviter de découvrir le SQL au boot :

```bash
# Uniquement si l’image / le bind-mount contient bien SEULEMENT l’additive V6 en plus
docker compose run --rm --entrypoint sh app -c 'prisma migrate deploy'
```

Sinon, le démarrage `app` appliquera via `docker-start.mjs` — **identique en dangerosité** si l’artefact est propre.

### 7. Basculer le service

```bash
docker compose up -d app
docker compose logs -f --tail=200 app
# Attendre [boot] migrate OK puis [boot] start / healthcheck
docker compose ps
curl -fsS -o /dev/null -w '%{http_code}\n' https://agent.naxialis.com/login
```

### 8. Tests fonctionnels post-déploiement

1. Login Auth.js.  
2. Génération **sujet seul** → brouillon WP `draft`.  
3. Génération avec langue `en-GB`, public/objectif custom → détail affiche `editorialContext`.  
4. Génération depuis file de sujets.  
5. Dashboard / sidebar / `/veille` / SEO inchangés fonctionnellement.  
6. Confirmer `SELECT "editorialContext" IS NULL FROM "ArticleGeneration" LIMIT 5;` pour historiques.

### 9. Rollback

| Couche | Action |
|---|---|
| Application | Redeploy image/tag précédent ; **ne pas** dropper `editorialContext` automatiquement. |
| Schéma | Colonne JSONB nullable : rétrocompatible avec l’ancien code (ignore le champ). Suppression optionnelle manuelle seulement si politique l’exige. |
| GEO | Si le drop avait été appliqué par erreur : **restauration depuis `pg_dump`** uniquement — pas de recreate partiel improvisé. |

---

## G. Synthèse décisionnelle

| Question | Réponse |
|---|---|
| Code V6.1 localement sain ? | **Oui** (tests/build/typecheck) |
| Prêt à déployer *immédiatement* depuis cet working tree ? | **Non** |
| Migration V6 additive sûre ? | **Oui**, si seule appliquée |
| Migration GEO drop sûre pour la prod ? | **Non — à exclure absolument** |
| Production inspectée ici ? | **Non** — contrôles VPS restants |

### Statut : **GO sous conditions** (C1–C6 ci-dessus)

Tant que C2/C3/C4 ne sont pas prouvés sur l’artefact et le VPS, traiter tout redémarrage Docker comme **NO-GO**.

---

*Fin de l’audit lecture seule. Aucun déploiement ni migration n’a été exécuté dans le cadre de ce document.*
