# Remédiation V7.16.1 — Résultats

**Baseline :** `v7.16.0` (`5d28794a0d3a9c185505bbaad864c13aef5a827e`)  
**Rapport :** `releases/V7.16.1-REPORT.md`  
**Recette technique :** 2026-11-26 — **797 pass / 0 fail / 1 skipped** (798 tests)  
**Recette utilisateur :** **43/43**  
**Publication code :** commit + tag `v7.16.1` (GO utilisateur).

Les documents d’audit V7.16.0 restent la photographie de l’état initial.

---

## Synthèse des statuts

| Statut | Nombre | IDs |
|--------|-------:|-----|
| **Corrigé** | **15** | AUTH-001, AUTH-003, AUTH-005, SEC-001, SEC-002, SEC-004, SEC-005, CMS-001, CMS-005, CMS-006, DB-003, DB-004, AI-005, AI-006, AI-007 |
| **Partiel** | **2** | AUTH-002, WS-003 |
| **Ouvert / reporté** | (hors livraison) | BACKUP-001/002, SEC-003, DEP-001, WS-001, PERF-*, TEST-*, QUAL-*, UX-001, AI-001/003, DB-002/005, INFRA-*, OBS-001, GOOG-003, DOC-001 |

---

## Constats corrigés (preuves)

### AUTH-001 — P1 — **Corrigé**

- **Cause :** aucune limitation login.
- **Correctif :** `AuthLoginAttempt` + rate-limit dans `authorize(credentials, request)` (callback Credentials inclus) ; pré-contrôle UX `loginAction` sans double comptage ; IP via `AUTH_TRUST_PROXY`.
- **Preuve recette :** HTTP `POST /api/auth/callback/credentials` sur migtest — seuil **5** ; tentatives au-delà sans nouvel insert ; XFF ignoré (`ip=unknown`) ; **0** ligne recipe sur `naxialis_agent` ; tests concurrence + persistance nouveau client Prisma.
- **Tests :** `auth-recipe-v7161`, `auth-login-rate-limit-v7161`, `security-v7161`.
- **Risque résiduel :** IP `unknown` sans proxy de confiance ; Next `@next/env` peut réécrire `ADMIN_*` depuis `.env` (méthodologie admin fictif HTTP).

### SEC-002 — P2 — **Corrigé**

- **Preuve :** `GET /api/agent/instructions` sans session → **401** ; auth avant `resolveAgentContext` (config OK/KO).
- **Tests :** HTTP `:4001`, `api-instructions-auth-v7161`, `security-v7161`.

### SEC-001 — P2 — **Corrigé**

- `session.maxAge` 12 h / `updateAge` 1 h — preuve source + `security-v7161`.

### SEC-004 — P3 — **Corrigé**

- `.gitignore` `.env*` ; `git check-ignore .env.local` OK. Backups/dumps aussi exclus.

### SEC-005 / CMS-006 — P2/P3 — **Corrigé**

- Revalidation URL à chaque fetch WP ; IPv4-mappées refusées — `security-v7161`.

### AUTH-003 — P2 — **Corrigé**

- `middleware.ts` (`getToken`) ; API privée → 401 ; build `ƒ Proxy`.

### AUTH-005 — P3 — **Corrigé**

- Dummy bcrypt email inconnu — `security-v7161`.

### CMS-005 — P2 — **Corrigé**

- `sanitize-html` allowlist (Tailwind, tableaux, FAQ details/summary, liens/images https) ; WP + Webflow à la création.
- **Preuve :** `sanitize-editorial-html-v7161`, `isolation-recipe-v7161` ; pas de rewrite historique DB.
- **Non-régression éditoriale :** confirmée en recette utilisateur 43/43.

### CMS-001 / AI-006 — P2 — **Corrigé**

- Idempotence session (`idempotent_replay`) ; `cms_draft_uncertain` sans recreate auto — preuve source + tests ; **aucune écriture CMS réelle**.

### DB-003 — P2 — **Corrigé**

- Tracker refuse `generationId`/`featuredImageId` hors workspace — Prisma migtest, 0 insert.

### DB-004 — P2 — **Corrigé**

- `updateMany`/`deleteMany` + workspace (research-configs, custom-themes, wordpress-references, `reorderThemes`, veille delete) — `isolation-recipe-v7161`.
- **Risque résiduel :** certains updates image encore par `id` après pré-check amont.

### AI-005 — P2 — **Corrigé**

- Collecte usage sur `turn_failed` / `turn_cancelled` + persistance catch génération.

### AI-007 — P3 — **Corrigé**

- Draft CMS connu → `completed` + message post-traitement (pas `failed` pur).

---

## Constats partiels

### AUTH-002 — P2 — **Partiel**

- **Fait :** rappel `AUTH_URL` dans `.env.example`.
- **Ouvert :** validation runtime VPS / reverse proxy → **V7.16.3**.
- **Impact :** host header / URLs Auth.js mal construits si mal configuré.
- **Compensation :** instance privée ; doc deploy.
- **Clôture :** checklist prod `AUTH_URL` + test login derrière proxy.

### WS-003 — P3 — **Partiel**

- **Fait :** écritures critiques renforcées (DB-004).
- **Ouvert :** revue exhaustive lectures `id` seules → **V7.16.2** si besoin.
- **Compensation :** `requireAuth` + workspace cookie + pré-checks.
- **Clôture :** fuzz IDOR authentifié ou audit routes restantes.

---

## Constats ouverts (hors V7.16.1)

| ID | Gravité | Impact | Compensation | Cible | Critère de clôture |
|----|---------|--------|--------------|-------|-------------------|
| BACKUP-001 | P1 | Pas de stratégie restore ops complète | Dump local + restore isolée démontrée en recette (≠ runbook prod) | V7.16.3 | Procédure + drill base neuve + login + `/usage` |
| BACKUP-002 | P2 | Stockage dumps | `backups/` gitignored | V7.16.3 | Politique stockage chiffré |
| SEC-003 | P2 | Abus quota OpenAI si session compromise | Auth admin unique ; rate-limit login | V7.16.2/VPS | Throttle routes payantes |
| DEP-001 | P2 | npm audit 3 high prisma/effect | Pas de `--force` | V7.16.2 | Patch compatible testé |
| WS-001 | P2 | Pas multi-tenant | Architecture mono-admin / espaces éditoriaux | V8+ | Refonte SaaS (NO GO actuel) |
| PERF-* / TEST-001 / QUAL-* / UX-001 / AI-001 / AI-003 / DB-002 / DB-005 | P2–P3 | Qualité / perf | Monitoring manuel | V7.16.2 | Selon plan |
| INFRA-* / OBS-001 / GOOG-003 / DOC-001 | P2–P3 | Ops prod | Instance privée | V7.16.3 | Runbooks + alerting |

---

## Sauvegarde (preuve locale — BACKUP-001 reste ouvert)

| | |
|--|--|
| Format | `pg_dump -Fc` (custom gzip) |
| Intégrité | `pg_restore -l` OK (228 TOC) |
| Restore isolée | `naxialis_agent_v7161_restore` |
| Compteurs post-restore | 16 / 10 / 4 / 119 / 5 |
| Limitation | **≠** procédure opérationnelle complète de reprise après incident |

---

## Note processus `:4001`

Les sorties Windows en erreur (`exit_code=4294967295`) des processus de validation sur le port **4001** correspondent à leur **arrêt volontaire** (`Stop-Process`) après les tests HTTP, **non** à un échec applicatif.
