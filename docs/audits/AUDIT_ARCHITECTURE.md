# Audit architecture — V7.16.0

---

## Organisation observée

- `app/` App Router (pages protégées, API).
- `lib/` services (agent, cms, google, images, openai-*, workspace, settings).
- `components/` UI.
- `prisma/` schéma + migrations.
- Docker multi-stage + `scripts/docker-start.mjs`.

Points positifs : séparation raisonnable UI / services / persistance ; workspace centralisé ; tracker coûts centralisé.

---

## Constats

### QUAL-002 — P3 — Confiance haute

- **Fichier :** `lib/agent/run-session.ts` (très volumineux).
- **Description :** complexité et responsabilité multiples (outils, logs, CMS, maillage).
- **Impact :** maintenabilité / risque de régression.
- **Correction :** découpage progressif sans changer le comportement éditorial.
- **Version :** V7.16.2 · complexité L.

### ARCH-001 — P3

- Couplage CMS WP/Webflow via registry — acceptable ; éviter une abstraction prématurée type microservices.
- **Recommandation :** pas de Redis/K8s sans besoin mesuré.

### ARCH-002 — INFO

- Auth sans middleware edge (voir AUTH-003).
- Pas de script `lint` npm (QUAL-001).

---

## Décision

Architecture **adaptée** à une app privée mono-équipe.  
Refonte complète : **non justifiée**.
