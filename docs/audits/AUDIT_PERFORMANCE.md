# Audit performance — V7.16.0

---

## Contrôles réalisés

- Volumes PostgreSQL (GSC 1582, GA4 640, inventaire WP 119).
- Revue qualitative des agrégations usage / dashboard / inventaires (code).
- **Non réalisé :** Lighthouse / profiling CPU mémoire en `next start` systématique ; charge artificielle.

Matériel : poste de développement Windows + PostgreSQL Docker local — **pas** représentatif d’un VPS de production.

---

## Constats

### PERF-001 — P2 — Confiance moyenne

- **Description :** tables GSC/GA quotidiennes déjà non triviales ; pages Analytics / opportunités / inventaires peuvent souffrir sans pagination/index adaptés à la croissance.
- **Preuve :** compteurs DB ; pas de mesure latence formalisée.
- **Correction :** profilage prod-like, vérifier index existants, pagination stricte, caches courts si besoin.
- **Version :** V7.16.2 · complexité M–L.

### PERF-002 — P3

- Mode `next dev` (PID 35972) ≠ perf production.
- Bundle / images featured : non mesurés ici.

### PERF-003 — INFO

- Export CSV usage : borné par filtres UI — surveiller `pageSize` API.

---

## Décision

**Non évalué quantitativement** en conditions production.  
Risques **potentiels** documentés, pas d’anomalie de latence P0/P1 démontrée.
