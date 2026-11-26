# Audit Docker / infrastructure — V7.16.0

**Aucun déploiement VPS** · Docker non redémarré.

---

## Artefacts

- `Dockerfile` multi-stage (deps → builder → runner user `nextjs`).
- `docker-compose.yml` / `docker-compose.local.yml`.
- `scripts/docker-start.mjs` entrypoint.
- Docs : `docs/deploiement-vps.md`.

---

## Contrôles

| Point | Observation |
|-------|-------------|
| Non-root | `USER nextjs` |
| Prisma generate | au build |
| Secrets build | placeholders build-only (pas de secrets réels dans Dockerfile) |
| Port | 3000 exposé |
| Standalone | copie `.next/standalone` ; `next start` local avertit standalone — entrypoint node dédié en image |
| Volumes | storage featured-images |

---

## Constats

### INFRA-002 — P3 — Confiance moyenne

- Divergence DX local (`next dev` / `next start`) vs image standalone — documenter la procédure unique de validation.
- Second `next dev` refusé dans le même dépôt (constaté V7.15.1).

### INFRA-003 — P2 — Confiance moyenne (ops)

- Migrations au démarrage : s’assurer que `drop_ai_visibility` ne peut pas être rejouée (INFRA-001).
- Healthchecks / restart policies : à vérifier sur le compose VPS réel (non inspecté à distance).

### DOC-001 — P3

- Runbooks VPS présents mais hétérogènes (plusieurs `deploy-v7*.sh` dans `releases/` non suivis git parfois) — ranger la doc opératoire.

---

## Décision

Base Docker **saine** pour instance privée.  
Production readiness globale : voir PRODUCTION_READINESS + BACKUP_RESTORE.
