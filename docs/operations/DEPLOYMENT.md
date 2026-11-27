# Déploiement VPS privé — procédure (non exécutée en V7.16.3)

**Aucun déploiement VPS dans cette version.** Document préparatoire.

## Prérequis

1. Tag Git `v7.16.3` validé
2. Accès VPS + inventaire conteneurs / volumes réels
3. Sauvegarde préalable réussie + restore drill documenté
4. Vérification tables GEO / `_prisma_migrations` sur le VPS
5. `AUTH_URL` HTTPS + reverse proxy contrôlant XFF
6. Secrets hors image

## Étapes (ordre)

1. Vérifier le tag Git
2. Identifier l’instance existante (noms réels à confirmer sur le VPS)
3. Vérifier conteneurs / disque
4. Inventaire migrations + tables GEO
5. Sauvegarde PostgreSQL + fichiers + secrets
6. Vérifier restaurabilité (base isolée)
7. Build / pull image
8. `npm run geo:guard` / absence drop GEO dans l’image
9. Valider `.env` production
10. Contrôler reverse proxy
11. Migrations contrôlées (`prisma migrate deploy`) — **pas** de drop GEO
12. Démarrer nouvelle version
13. Healthchecks `/api/health/live` + `/api/health/ready`
14. Smoke login + dashboard + usage
15. Vérifier compteurs / workspaces / coûts
16. Validation finale

## Garde migrate au boot

`scripts/docker-start.mjs` exécute `prisma migrate deploy` puis `server.js`, refuse les bases migtest/bench, refuse la présence de `drop_ai_visibility_monitor`.

`SKIP_PRISMA_MIGRATE=1` possible pour migration manuelle préalable.
