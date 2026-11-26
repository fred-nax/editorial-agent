# Audit global — Naxialis Content Agent (V7.16.0)

**Date :** 2026-11-26  
**Baseline Git :** `v7.15.1` / `fff9c6d9c4289964d34350854a193728e914e506`  
**Méthodologie :** contrôles code + lectures PostgreSQL + tests locaux ; inspiration **OWASP ASVS 5.0.0** (publié 2025-05-30) — **aucune certification revendiquée**.  
**Nature :** diagnostic uniquement — aucun correctif fonctionnel, aucune migration, aucune écriture CMS/OpenAI.

---

## 1. Résumé de l’application

Application web **privée** (Next.js App Router, TypeScript, Prisma/PostgreSQL, Auth.js Credentials, Docker) pilotant des **agents OpenAI existants** pour produire des **brouillons** WordPress / Webflow, avec file éditoriale, inventaires CMS, veille/SEO, Google GSC/GA4 (WordPress configuré), et registre de consommations `OpenAiUsageEvent`.

Les **espaces éditoriaux** (WordPress / Webflow) cloisonnent les données métier sous **un seul compte administrateur** — ce n’est **pas** un multi-tenant SaaS.

---

## 2. Baseline vérifiée

| Élément | Résultat |
|---------|----------|
| `git rev-parse HEAD` | `fff9c6d9c4289964d34350854a193728e914e506` |
| Tag exact | `v7.15.1` |
| Working tree | propre hors artefacts locaux non suivis (`.env.local`, `backups/`, scripts releases historiques) |
| Port 4000 | PID **35972** (serveur utilisateur, non arrêté) |
| `naxialis_agent` | 16 générations · 10 images · 4 events · 119 posts WP · 5 items Webflow · Webflow hist. **$1.023257** |
| GSC / GA4 | `sc-domain:naxialis.com` / `399634894` (workspace WordPress uniquement) |
| Tests | **759** pass / 0 fail / 1 skipped · typecheck OK |
| Prisma | validate OK · migrate status **up to date** (37 migrations) |

---

## 3. Périmètre audité

Auth, routes API (~71 fichiers), isolation workspace, secrets/config, schéma Prisma & intégrité, OpenAI/agents/tracker/pricing, WordPress & Webflow (code), Google GSC/GA4/cron (code + config locale), architecture, dépendances (`npm audit`), Docker/compose, sauvegarde (documentaire), observabilité, tests, UX/a11y (revue code), performances (analyse qualitative + volumes DB).

**Non réalisé / limité :** scan VPS, restauration réelle, charge agressive, recettes GSC/GA4 Webflow, appels OpenAI payants, écritures CMS, revue complète pixel-perfect a11y, mesure Lighthouse production systématique.

---

## 4. Cartographie chiffrée

| Indicateur | Valeur |
|------------|--------|
| Routes API (`app/api/**/route.ts`) | **71** |
| Modèles Prisma | **27** |
| Fichiers de tests | **76** |
| Assertions `it(`/`test(` (approx.) | **760** exécutés |
| Dépendances prod | **14** |
| Dépendances dev | **10** |
| Tables `pg_stat_user_tables` | **28** |

Documents détaillés : voir index §10.

---

## 5. Synthèse des constats (dénombrement exact)

| Gravité | Nombre exact |
|---------|-------------:|
| **P0** | **0** |
| **P1** | **2** |
| **P2** | **24** |
| **P3** | **17** |
| **INFO** (hors anomalies) | **16** (observations / forces) |

Total anomalies P0–P3 : **43**. Identifiants uniques — matrice §12.

Compléments intégrés : [Map API routes and auth](dd9ba31a-1726-4ab3-990d-d77add5456bf), [Prisma schema workspace audit](51c9d80c-7811-489d-8317-7c51a13db664), [OpenAI CMS Google audit](7bb5dc5d-70a0-4761-be6d-c5c016714e70).

Détail : [REMEDIATION_PLAN.md](./REMEDIATION_PLAN.md) et fiches thématiques.

---

## 6. Statuts par domaine

| Domaine | Statut |
|---------|--------|
| Cahier des charges (principes fondateurs) | **Validé dans le périmètre contrôlé** (extensions WP/Webflow/Google/workspaces = évolutions validées) |
| Authentification | **À renforcer** (pas de rate-limit login) |
| Autorisation API | **Validé dans le périmètre contrôlé** (sondages 401/307 OK) |
| Isolation workspace | **Validé pour espaces éditoriaux** ; **non** SaaS multi-tenant |
| Secrets | **Validé dans le périmètre contrôlé** (pas de `NEXT_PUBLIC_` secret ; chiffrement AppSettings/Google) |
| PostgreSQL / Prisma | **Validé** (intégrité V7.15.1 OK) ; **À renforcer** ops (GEO drop historique) |
| OpenAI / brouillons CMS | **Validé** (draft forcé côté serveur ; publish Webflow bloqué) |
| Registre consommations | **Validé** (4 events + total 0.158824) |
| Tarification | **À renforcer** (vérif. continue vs docs OpenAI ; version `v7150-2026-11-25`) |
| WordPress / Webflow | **Validé code** ; recettes distantes non rejouées |
| Google | **Validé WordPress config** ; Webflow Google **non évalué** (non configuré) |
| Architecture | **À renforcer** (complexité, défense en profondeur middleware) |
| Performance | **Non évalué** (mesures prod systématiques) / risques potentiels documentés |
| Dépendances | **À renforcer** (alertes npm audit) |
| Docker / VPS prep | **À renforcer** (readiness) |
| Sauvegarde / restauration | **Non conforme** au critère « restauration vérifiée » |
| Tests | **À renforcer** (leçons V7.14.1 / V7.15.0) |
| UX / a11y | **À renforcer** (revue partielle) |

---

## 7. Points forts démontrés

- Authentification obligatoire layout `(protected)` + `requireAuth` sur routes API métier sondées.
- Pas d’inscription publique ; Credentials + bcrypt ; un compte admin.
- Création CMS **draft only** (WP `status: "draft"` ; Webflow `isDraft: true` + deny-list publish).
- Secrets serveur ; chiffrement `APP_SETTINGS_ENCRYPTION_KEY` / tokens Google.
- Isolation workspace cookie httpOnly + header écriture ; intégrité DB 0 mismatch event/image↔workspace.
- Registre OpenAI V7.15.1 persisté et relu ; garde migtest ; marqueur `usageTracking`.
- Cron Google Bearer + `timingSafeEqual` ; refus si secret absent.
- CSV usage avec garde formules.
- Aucun `dangerouslySetInnerHTML` trouvé dans le code applicatif.
- Docker multi-stage, user `nextjs`, Prisma generate au build.

---

## 8. Principaux risques

1. **Brute-force login** sans rate-limit (AUTH-001) si exposé Internet.  
2. **Absence de restauration réellement testée** (BACKUP-001).  
3. **Confusion multi-tenant** : un seul principal Auth pour plusieurs workspaces (WS-001).  
4. **Dette de preuve tests** vs persistance/DB client (TEST-001).  
5. **Volumes GSC/GA** croissants sans benchmark prod formalisé (PERF-001).  
6. **Divulgation config** / ordre auth sur `/api/agent/instructions` (SEC-002).  
7. **HTML WP non sanitizé** côté connecteur (CMS-005) si compte WP permissif.  
8. **Schéma GEO** : drop absent du dépôt vs créations versionnées (INFRA-004).
---

## 9. Décision de préparation à la production

| Contexte | Décision |
|----------|----------|
| Usage local / privé Naxialis (accès restreint) | **GO sous conditions** |
| Déploiement VPS privé Naxialis | **GO sous conditions** (voir prérequis) |
| Installation dédiée client (un tenant = une instance) | **GO sous conditions** |
| Exploitation **multi-tenant SaaS** | **NO GO** |

**Prérequis GO sous conditions (bloquants avant Internet large) :**

- Traiter **AUTH-001** (rate-limit / lockout / fail2ban / IP allowlist).  
- Documenter et **tester restauration** (BACKUP-001) sur base isolée.  
- Confirmer secrets prod (`AUTH_SECRET`, `GOOGLE_SYNC_CRON_SECRET`, `APP_SETTINGS_ENCRYPTION_KEY`) rotatables et absents des images.  
- Ne **jamais** réappliquer `drop_ai_visibility_monitor` (INFRA-001).

**P0/P1 :** aucun P0 ; P1 ci-dessus non ignorés dans la décision.

---

## 10. Index des documents

| Document | Contenu |
|----------|---------|
| [AUDIT_SECURITY.md](./AUDIT_SECURITY.md) | Auth, API, XSS/injection, secrets |
| [AUDIT_WORKSPACE_ISOLATION.md](./AUDIT_WORKSPACE_ISOLATION.md) | Cloisonnement espaces |
| [AUDIT_DATABASE.md](./AUDIT_DATABASE.md) | Prisma, migrations, intégrité |
| [AUDIT_OPENAI.md](./AUDIT_OPENAI.md) | Agents, tracker, pricing |
| [AUDIT_CMS_INTEGRATIONS.md](./AUDIT_CMS_INTEGRATIONS.md) | WordPress / Webflow |
| [AUDIT_GOOGLE.md](./AUDIT_GOOGLE.md) | GSC / GA4 / cron |
| [AUDIT_ARCHITECTURE.md](./AUDIT_ARCHITECTURE.md) | Structure, couplage |
| [AUDIT_PERFORMANCE.md](./AUDIT_PERFORMANCE.md) | Perf |
| [AUDIT_DEPENDENCIES.md](./AUDIT_DEPENDENCIES.md) | npm audit |
| [AUDIT_TESTS.md](./AUDIT_TESTS.md) | Couverture & lacunes |
| [AUDIT_DOCKER.md](./AUDIT_DOCKER.md) | Docker / déploiement |
| [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | Sauvegardes |
| [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) | Checklist prod |
| [REMEDIATION_PLAN.md](./REMEDIATION_PLAN.md) | V7.16.1–V7.16.3 |
| [../../releases/V7.16.0-REPORT.md](../../releases/V7.16.0-REPORT.md) | Rapport de release audit |

---

## 11. Charge estimée (indicatif)

| Version | Focus | Charge |
|---------|-------|--------|
| V7.16.1 | Sécurité / intégrité (P1 + P2 critiques) | **3–6 j** |
| V7.16.2 | Perf / qualité / tests | **4–8 j** |
| V7.16.3 | Production readiness / backup restore | **3–5 j** |

Publication documentaire : commit + tag **`v7.16.0`** (documents d’audit uniquement).

---

## 12. Matrice exhaustive des constats

| ID | Gravité | Domaine | Cible | Résumé | Doc |
|----|---------|---------|-------|--------|-----|
| AUTH-001 | P1 | Auth | V7.16.1 | Pas de rate-limit login | SECURITY |
| BACKUP-001 | P1 | Ops | V7.16.3 | Restauration non prouvée | BACKUP_RESTORE |
| AUTH-002 | P2 | Auth | V7.16.1/3 | `trustHost: true` / AUTH_URL | SECURITY |
| AUTH-003 | P2 | Auth | V7.16.1 | Pas de middleware edge | SECURITY |
| SEC-001 | P2 | Auth | V7.16.1 | Session JWT sans maxAge explicite | SECURITY |
| SEC-002 | P2 | Auth | V7.16.1 | 503 config avant 401 (`/api/agent/instructions`) | SECURITY |
| SEC-003 | P2 | Auth | V7.16.1 | Pas de throttle routes OpenAI (session) | SECURITY |
| SEC-005 | P2 | SSRF | V7.16.1 | Validation URL WP surtout à l’enregistrement | SECURITY |
| BACKUP-002 | P2 | Ops | V7.16.3 | Protection dumps | BACKUP_RESTORE |
| WS-001 | P2 | Workspace | Doc / V8+ | Pas multi-tenant SaaS | WORKSPACE |
| AI-001 | P2 | OpenAI | V7.16.2 | Prompt injection résiduelle | OPENAI |
| AI-005 | P2 | OpenAI | V7.16.1 | Trous tracking sur échecs | OPENAI |
| AI-006 | P2 | OpenAI/CMS | V7.16.1 | Risque double draft | OPENAI |
| TEST-001 | P2 | Tests | V7.16.2 | Tests ≠ preuve prod (V7.14.1/15.0) | TESTS |
| DEP-001 | P2 | Deps | V7.16.2 | npm audit high prisma/effect | DEPENDENCIES |
| PERF-001 | P2 | Perf | V7.16.2 | Volumes GSC/GA sans bench | PERFORMANCE |
| INFRA-001 | P2 | DB/Ops | V7.16.3 | drop GEO appliqué historiquement | DATABASE |
| INFRA-003 | P2 | Docker | V7.16.3 | Healthchecks/restart VPS non inspectés | DOCKER |
| INFRA-004 | P2 | DB | V7.16.3 | Créations GEO versionnées sans drop dépôt | DATABASE |
| CMS-001 | P2 | CMS | V7.16.1 | Retry → doublon brouillon WP | CMS |
| CMS-005 | P2 | CMS/XSS | V7.16.1 | HTML WP LLM non sanitizé | CMS |
| DB-003 | P2 | DB | V7.16.1 | Tracker sans vérif parent workspace | DATABASE |
| DB-004 | P2 | DB | V7.16.1 | Updates par `id` seul après pré-check | DATABASE |
| DB-005 | P2 | DB | V7.16.2 | Unicité stats Google sans workspaceId | DATABASE |
| OBS-001 | P2 | Ops | V7.16.3 | Pas d’alerting centralisé | PRODUCTION |
| GOOG-003 | P2 | Google | V7.16.3 | Secret cron à durcir ops | GOOGLE |
| AUTH-005 | P3 | Auth | V7.16.1 | Oracle timing email | SECURITY |
| SEC-004 | P3 | Secrets | V7.16.1 | `.gitignore` ne couvre pas `.env.local` | SECURITY |
| AI-003 | P3 | Pricing | V7.16.2 | Revue tarifs non automatisée | OPENAI |
| AI-007 | P3 | OpenAI | V7.16.1 | Gen `failed` alors draft CMS OK | OPENAI |
| QUAL-001 | P3 | Qualité | V7.16.2 | Pas de script `lint` | ARCHITECTURE |
| QUAL-002 | P3 | Qualité | V7.16.2 | `run-session.ts` trop gros | ARCHITECTURE |
| UX-001 | P3 | UX | V7.16.2 | Double-submit actions payantes | SECURITY / GLOBAL |
| DOC-001 | P3 | Docs | V7.16.3 | Runbooks deploy hétérogènes | DOCKER |
| DB-002 | P3 | DB | V7.16.2 | Cascade image←génération / fichiers | DATABASE |
| INFRA-002 | P3 | Docker | V7.16.3 | Divergence next dev/start/standalone | DOCKER |
| TEST-002 | P3 | Tests | V7.16.2 | Peu de tests rate-limit/middleware | TESTS |
| PERF-002 | P3 | Perf | V7.16.2 | Mesures en mode dev non représentatives | PERFORMANCE |
| ARCH-001 | P3 | Archi | V7.16.2 | Couplage CMS acceptable, pas de microservices | ARCHITECTURE |
| WS-003 | P3 | Workspace | V7.16.1 | Lectures `id` + contrôle amont | WORKSPACE |
| GOOG-002 | P3 | Google | V7.16.2 | Volumes stats / sync partielle | GOOGLE |
| CMS-004 | P3 | Webflow | V7.16.2 | Tokens / uploads à surveiller | CMS |
| CMS-006 | P3 | SSRF | V7.16.1 | Pointeur SEC-005 côté CMS | CMS |
| AUTH-004 | INFO | Auth | — | Cookies workspace OK | SECURITY |
| AI-002 | INFO | OpenAI | — | Completeness partial = conception | OPENAI |
| AI-004 | INFO | OpenAI | — | Validation V7.15.1 events | OPENAI |
| DB-001 | INFO | DB | — | Token Prisma / Decimal | DATABASE |
| WS-002 | INFO | Workspace | — | Génération fige workspace | WORKSPACE |
| CMS-002 | INFO | WP | — | Pas de publish à la création | CMS |
| CMS-003 | INFO | Webflow | — | Isolation site non rejouée live | CMS |
| GOOG-001 | INFO | Google | — | Webflow Google non configuré | GOOGLE |
| DEP-002 | INFO | Deps | — | next-auth beta | DEPENDENCIES |
| TEST-003 | INFO | Tests | — | Garde migtest tests | TESTS |
| PERF-003 | INFO | Perf | — | Export CSV borné UI | PERFORMANCE |
| ARCH-002 | INFO | Archi | — | Auth sans middleware (lien AUTH-003) | ARCHITECTURE |
| INFO-FORCE-01..04 | INFO | — | — | Draft-only, secrets, cron, CSV | GLOBAL §7 |
