# Production readiness — V7.16.0

---

## Décision (rappel)

| Contexte | Statut |
|----------|--------|
| Local | GO sous conditions |
| VPS privé Naxialis | **GO sous conditions** |
| Instance dédiée client | GO sous conditions |
| SaaS multi-tenant | **NO GO** |

---

## Checklist prérequis (GO sous conditions)

| # | Prérequis | Lié à | Statut audit |
|---|-----------|-------|--------------|
| 1 | Rate-limit / protection login | AUTH-001 | À faire |
| 2 | Restore drill documenté | BACKUP-001 | À faire |
| 3 | Secrets prod forts + rotation | SEC / GOOG-003 | À confirmer ops |
| 4 | `AUTH_URL` + proxy TLS | AUTH-002 | À confirmer |
| 5 | Garde anti re-drop GEO | INFRA-001 | Process |
| 6 | Monitoring minimal (uptime + erreurs 5xx + sync Google) | OBS-001 | À faire |
| 7 | Recette GSC/GA4 Webflow (si usage) | GOOG-001 | Externe |

---

## OBS-001 — P2

- Logs structurés présents (`lib/logger`) mais pas d’alerting centralisé démontré.
- Jobs Google : recover stale existe — bon point.
- Générations long-running : interruption / reprise à surveiller ops.

---

## Ce qui est déjà prêt

- Auth privée, brouillons only, Docker non-root, Prisma migrate status OK, registre coûts, isolation workspace mono-admin, sondages API 401.
