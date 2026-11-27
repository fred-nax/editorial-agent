# Plan de remédiation — post V7.16.0 / V7.16.1 / V7.16.2

Baseline audit V7.16.0 : **P0=0 · P1=2 · P2=24 · P3=17** (43) — matrice `AUDIT_GLOBAL.md` §12 (photographie historique).

**V7.16.1 publiée** — `REMEDIATION_V7.16.1.md` · `releases/V7.16.1-REPORT.md`.  
**V7.16.2 publiée** — `REMEDIATION_V7.16.2.md` · `releases/V7.16.2-REPORT.md` · `PERFORMANCE_BENCHMARK_V7.16.2.md`.  
Recette V7.16.2 : **43/43** applicables · 1 N/A (thème clair/sombre) · 0 anomalie.

---

## V7.16.1 — Sécurité et intégrité — **LIVRÉ**

| ID | Priorité | Statut |
|----|----------|--------|
| AUTH-001, AUTH-003, AUTH-005, SEC-001/002/004/005, CMS-*, DB-003/004, AI-005/006/007 | P1–P3 | **Corrigé** |
| AUTH-002 | P2 | **Partiel** (renforcé V7.16.2 garde prod) |
| WS-003 | P3 | **Partiel** (renforcé V7.16.2 API article) |
| WS-001 | P2 | **NO GO SaaS** |

---

## V7.16.2 — Performance et qualité — **LIVRÉ**

| ID | Priorité | Statut |
|----|----------|--------|
| PERF-001/002/003 | P2–INFO | **Corrigé** |
| SEC-003 | P2 | **Corrigé** |
| DEP-001 | P2 | **Corrigé** (`effect@3.22.5`) |
| QUAL-001 | P3 | **Corrigé** |
| TEST-001 | P2 | **Corrigé** |
| UX-001 | P3 | **Corrigé** (confirmé) |
| AUTH-002 | P2 | **Partiel** |
| WS-003 | P3 | **Partiel** |
| QUAL-002, AI-001/003, DB-002/005 | P2–P3 | **Reporté** |

---

## V7.16.3 — Production readiness — **NON DÉMARRÉ**

| ID | Priorité | Action |
|----|----------|--------|
| BACKUP-001 | P1 | Procédure + restore drill + runbook VPS |
| BACKUP-002 | P2 | Sécuriser stockage dumps |
| AUTH-002 | P2 | Checklist `AUTH_URL` / trustHost VPS |
| OBS-001 | P2 | Alerting uptime/5xx/sync |
| INFRA-* | P2–P3 | Docker/VPS, garde GEO, schéma neuf |
| DOC-001 | P3 | Ranger scripts deploy |
| GOOG-003 | P2 | Rotation secret cron |
| Secrets / rollback | — | Procédures déploiement privé |

Conditions minimales VPS privé sûr : BACKUP-001 prouvé, AUTH_URL + TLS proxy, secrets hors image, monitoring 5xx, rollback documenté.

---

## Hors scope

- SaaS multi-tenant (WS-001) — **NO GO**.
- V8.
- Mode sombre (hors produit actuel).

---

## Ordre recommandé (suite)

1. Attendre GO utilisateur explicite pour **V7.16.3**.  
2. Ne pas démarrer V8 sans GO.
