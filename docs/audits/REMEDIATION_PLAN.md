# Plan de remédiation — post V7.16.0 / V7.16.1

Baseline audit V7.16.0 : **P0=0 · P1=2 · P2=24 · P3=17** (43) — matrice `AUDIT_GLOBAL.md` §12 (photographie historique).

**V7.16.1 publiée** — voir `REMEDIATION_V7.16.1.md` et `releases/V7.16.1-REPORT.md`.  
Recette : technique **797/0/1** · utilisateur **43/43**.

Charge indicative homme-jours (1 dev familier du repo).

---

## V7.16.1 — Sécurité et intégrité — **LIVRÉ**

| ID | Priorité | Statut | Notes |
|----|----------|--------|-------|
| AUTH-001 | P1 | **Corrigé** | Rate-limit `authorize` + PostgreSQL |
| AUTH-003 | P2 | **Corrigé** | Middleware API |
| AUTH-005 | P3 | **Corrigé** | Dummy bcrypt |
| SEC-001 | P2 | **Corrigé** | maxAge session |
| SEC-002 | P2 | **Corrigé** | 401 avant config OpenAI |
| SEC-004 | P3 | **Corrigé** | `.env*` gitignore |
| SEC-005 / CMS-006 | P2/P3 | **Corrigé** | SSRF fetch + IPv4-mappées |
| CMS-005 | P2 | **Corrigé** | sanitize-html éditorial |
| CMS-001 / AI-006 | P2 | **Corrigé** | Idempotence draft |
| DB-003 | P2 | **Corrigé** | Tracker parents workspace |
| DB-004 | P2 | **Corrigé** | updateMany/deleteMany + ws |
| AI-005 | P2 | **Corrigé** | Tracking échecs session |
| AI-007 | P3 | **Corrigé** | Draft OK ≠ failed |
| AUTH-002 | P2 | **Partiel** | Doc `.env.example` ; ops V7.16.3 |
| WS-003 | P3 | **Partiel** | Écritures critiques ; suite V7.16.2 |
| SEC-003 | P2 | **Reporté** | Throttle OpenAI → V7.16.2 / VPS |
| GOOG-003 | P2 | **Reporté** | V7.16.3 |
| INFRA-001 / 004 | P2 | **Reporté** | V7.16.3 |
| WS-001 | P2 | **NO GO SaaS** | Doc / V8+ |

---

## V7.16.2 — Performance et qualité (4–8 j)

| ID | Priorité | Action | Complexité | Tests |
|----|----------|--------|------------|-------|
| PERF-001 | P2 | Profilage Analytics/inventaires + index/pagination | M–L | benches isolés |
| TEST-001 | P2 | Smoke Next+DB+events en CI isolée | M | nouveau smoke |
| AI-001 | P2 | Durcissement entrées outils / fixtures injection | M | tests adversariaux mock |
| SEC-003 | P2 | Throttle routes OpenAI payantes (session/IP) | M | plafond/heure |
| DB-005 | P2 | Documenter / revoir unicité stats Google vs workspace | M | doc + test collision |
| DEP-001 | P2 | Suivre patch Prisma/effect (pas force-fix aveugle) | M | CI audit |
| QUAL-002 | P3 | Découper `run-session.ts` | L | non-régression génération |
| QUAL-001 | P3 | Ajouter `npm run lint` | F | CI |
| UX-001 | P3 | Revue double-submit actions payantes | F–M | UI tests légers |
| AI-003 | P3 | Revue tarifs OpenAI périodique | F | fixture pricing |
| WS-003 | P3 | Compléter revue lectures `id` | M | isolation |
| DB-002 | P3 | Cascade image / fichiers | M | tests |

---

## V7.16.3 — Production readiness (3–5 j)

| ID | Priorité | Action | Complexité | Critère |
|----|----------|--------|------------|---------|
| BACKUP-001 | P1 | Procédure + restore drill base neuve | M | compteurs + login + `/usage` |
| BACKUP-002 | P2 | Sécuriser stockage dumps | F | pas de dump dans git (déjà partiel) |
| AUTH-002 | P2 | Checklist `AUTH_URL` / trustHost VPS | F | login derrière proxy |
| OBS-001 | P2 | Alerting minimal uptime/5xx/sync | M | alerte test |
| INFRA-002/003 | P2–P3 | Harmoniser runbooks Docker/VPS | M | une procédure |
| INFRA-001/004 | P2 | Garde GEO / schéma neuf | M | CI migrate scratch |
| DOC-001 | P3 | Ranger scripts deploy | F | index docs |
| GOOG-003 | P2 | Rotation secret cron | F | secret absent → 401 |

---

## Hors scope immédiat

- Transformation multi-tenant SaaS (WS-001 XL) — **NO GO**.
- Refonte microservices.
- Mise à jour force dépendances sans besoin.

---

## Ordre recommandé (suite)

1. **V7.16.3** BACKUP-001 (bloquant GO Internet) + AUTH_URL.  
2. **V7.16.2** perf / SEC-003 / DEP-001 / qualité.  
3. Ne pas démarrer sans GO utilisateur explicite.
