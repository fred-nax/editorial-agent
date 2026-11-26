# Audit dépendances — V7.16.0

**Aucun** `npm audit fix` · **aucune** mise à jour effectuée.

---

## Stack (package.json)

| Paquet | Contrainte |
|--------|------------|
| next | ^16.4.6 |
| react / react-dom | ^19.3.0 |
| @prisma/client / prisma | ^7.10.1 |
| next-auth | ^5.0.0-beta.32 |
| openai | ^7.25.0 |
| Node image Docker | 22-alpine |

Prod deps : **14** · Dev deps : **10**.

---

## npm audit (2026-11-26)

| Scope | Critique | High | Moderate | Low |
|-------|---------:|-----:|---------:|----:|
| Complet | 0 | 3 | 4 | 0 |
| `--omit=dev` | 0 | 3 | (prisma/effect) | 0 |

Alerte principale : **effect ≤3.22.0** ReDoS (GHSA-7589-6fvf-x4pw) via chaîne **prisma / @prisma/config**.  
Correctif upstream suggéré peut imposer un **downgrade breaking** — non appliqué.

### DEP-001 — P2 — Confiance moyenne

- **Impact runtime app :** limité (plutôt CLI/config Prisma) ; Docker installe aussi `prisma` global pour migrate.
- **Action :** suivre patch Prisma 7.x ; ne pas `audit fix --force` sans plan.
- **Version :** V7.16.2 / V7.16.3.

### DEP-002 — INFO

- `next-auth` encore en **beta** — risque de breaking changes.
- Licence projet `ISC` ; revue licences transitives non exhaustive.

---

## Décision

Dépendances **modernes** et cohérentes ; alertes à traiter sans précipitation.
