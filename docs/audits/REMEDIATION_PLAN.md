# Plan de remédiation — post V7.16.0

Baseline audit : **P0=0 · P1=2 · P2=24 · P3=17** (43 anomalies) — matrice `AUDIT_GLOBAL.md` §12.

Aucun correctif applicatif dans V7.16.0 (publication documentaire seule). Attendre GO utilisateur avant démarrage V7.16.1+.

Charge indicative homme-jours (1 dev familier du repo).

---

## V7.16.1 — Sécurité et intégrité (3–6 j)

| ID | Priorité | Action | Complexité | Critère d’acceptation | Tests |
|----|----------|--------|------------|----------------------|-------|
| AUTH-001 | P1 | Rate-limit / lockout login (+ option allowlist) | M | 10 échecs → blocage temporaire ; login légitime OK | tests unitaires limiteur + manuel |
| AUTH-002 | P2 | Doc + vérif `AUTH_URL` / trustHost | F | checklist deploy | test config |
| AUTH-003 | P2 | Middleware ou garde API central | M | route oubliée simulée → 401 | test middleware |
| AUTH-005 | P3 | Timing-safe email + dummy bcrypt | F | pas d’oracle email mesurable | test |
| SEC-001 | P2 | `maxAge` / `updateAge` session JWT explicites | F | session expire selon politique | test auth |
| SEC-002 | P2 | 401 avant tout resolve OpenAI sur `/api/agent/instructions` | F | non-auth → 401 uniquement | test HTTP |
| SEC-003 | P2 | Throttle routes OpenAI payantes (par session/IP) | M | plafond/heure respecté | test |
| SEC-004 | P3 | `.gitignore` `.env*` + `.dockerignore` passwords | F | `git check-ignore .env.local` | — |
| SEC-005 | P2 | SSRF : revalider URL/IP à chaque fetch WP | M | IPs privées refusées | tests unitaires |
| CMS-005 | P2 | Sanitize HTML WP à la création draft | M | scripts/on* retirés ou escapés | tests |
| DB-003 | P2 | Vérifier FK workspace sur generation/image dans tracker | F–M | insert cross-ws refuse | test Prisma |
| GOOG-003 | P2 | Politique secret cron + rotation | F | secret absent → 401 ; secret OK → 202 | déjà partiel |
| INFRA-001 | P2 | Garde deploy anti `drop_ai_visibility` | F/M | migrate refuse / doc CI | script check |
| INFRA-004 | P2 | CI schéma neuf sans tables Visibility* orphelines | M | migrate from scratch clean | CI |
| WS-001 | P2 | Clarifier non-SaaS dans docs produit | F | texte publié | — |

**Régression :** auth, Google cron, cookies session.

---

## V7.16.2 — Performance et qualité (4–8 j)

| ID | Priorité | Action | Complexité | Tests |
|----|----------|--------|------------|-------|
| PERF-001 | P2 | Profilage Analytics/inventaires + index/pagination | M–L | benches isolés |
| TEST-001 | P2 | Smoke Next+DB+events en CI isolée | M | nouveau smoke |
| AI-001 | P2 | Durcissement entrées outils / fixtures injection | M | tests adversariaux mock |
| AI-005 | P2 | Persister usage aussi sur chemins d’échec observables | M | tests tracker |
| AI-006 / CMS-001 | P2 | Idempotence / un seul draft tool call par session | M | tests connecteur mock réseau |
| AI-007 | P3 | Ne pas marquer failed si draft CMS OK + usage KO | M | tests génération |
| DB-004 | P2 | `where: { id, workspaceId }` sur updates/deletes | M | tests isolation |
| DB-005 | P2 | Documenter / revoir unicité stats Google vs workspace | M | doc + test collision |
| DEP-001 | P2 | Suivre patch Prisma/effect (pas force-fix aveugle) | M | CI audit |
| QUAL-002 | P3 | Découper `run-session.ts` | L | non-régression génération |
| QUAL-001 | P3 | Ajouter `npm run lint` | F | CI |
| UX-001 | P3 | Revue double-submit actions payantes | F–M | UI tests légers |
| AI-003 | P3 | Revue tarifs OpenAI périodique | F | fixture pricing |

---

## V7.16.3 — Production readiness (3–5 j)

| ID | Priorité | Action | Complexité | Critère |
|----|----------|--------|------------|---------|
| BACKUP-001 | P1 | Procédure + restore drill base neuve | M | compteurs + login + `/usage` |
| BACKUP-002 | P2 | Sécuriser stockage dumps | F | pas de dump dans git |
| OBS-001 | P2 | Alerting minimal uptime/5xx/sync | M | alerte test |
| INFRA-002/003 | P2–P3 | Harmoniser runbooks Docker/VPS | M | une procédure |
| DOC-001 | P3 | Ranger scripts deploy | F | index docs |
| GOOG-001 | INFO | Recette GSC/GA4 Webflow quand prêt | externe | fiche recette |

---

## Hors scope immédiat

- Transformation multi-tenant SaaS (WS-001 XL).
- Refonte microservices.
- Mise à jour force dépendances sans besoin.

---

## Ordre recommandé

1. AUTH-001 + BACKUP-001 (bloquants GO Internet).  
2. AUTH-003 / SEC-001 / INFRA-001.  
3. TEST-001 + PERF-001.  
4. Reste V7.16.2 / V7.16.3.
