# Remédiation V7.16.2 — Performance, qualité, fiabilité

**Baseline :** `v7.16.1` (`625fb5e7787f9dec0743d94844998d7524dfe8f6`)  
**Livraison :** tag `v7.16.2` — voir `releases/V7.16.2-REPORT.md`.

## Recette utilisateur

- **43/43** contrôles applicables réussis.
- **1** non applicable (mode clair/sombre absent — non développé).
- **0** anomalie · **0** régression.

## Synthèse des constats

| Statut | IDs |
|--------|-----|
| **Corrigé** | PERF-001, PERF-002, PERF-003, SEC-003, DEP-001, QUAL-001, TEST-001, UX-001 |
| **Partiel** | AUTH-002 (garde prod ; proxy ops → V7.16.3), WS-003 (API article ; autres lectures → suite) |
| **Ouvert / V7.16.3+** | BACKUP-001/002, QUAL-002, AI-001/003, DB-002/005, INFRA-*, OBS-001, GOOG-003, WS-001 |

---

## Détail des corrections

### PERF-001 — P2 — **Corrigé**

- Pagination serveur historique (`listArticleHistory`, tri `createdAt desc, id desc`, filtres statut/recherche, pages vides gérées).
- Usage history : index léger + hydrate page ; export borné.
- Dashboard SEO : `groupBy` top-5 ; WP/articles scopés `workspaceId`.
- `getUsageDashboardTotals` (agrégat SQL, aligné sur `getUsageSummary` — test exactitude).
- Recovery featured-image relationnelle ; throttle 60 s hors boot (`fromBoot` non throttlé).
- `resolveActiveWorkspace` = React `cache()` (dédup requête RSC).

### PERF-002 — P3 — **Corrigé** (méthode)

Benchmarks isolés hors `next dev`.

### PERF-003 — INFO — **Corrigé**

Export CSV plafond + en-têtes `X-Export-*` ; protection formules.

### SEC-003 — P2 — **Corrigé**

Throttle mémoire processus sur generate / titles / featured-image / veille / opportunities.

### DEP-001 — P2 — **Corrigé**

`overrides.effect = 3.22.5` — `npm audit --omit=dev` : 0.  
Dev résiduel : 4 moderate minimatch/shadcn (hors runtime).

### QUAL-001 — P3 — **Corrigé**

`npm run lint` → `tsc --noEmit`.

### TEST-001 — P2 — **Corrigé** (ciblé)

Tests pagination, rate-limit payant, AUTH_URL, follow-up perf, exactitude totals.

### UX-001 — P3 — **Corrigé** (confirmé)

Actions payantes désactivées quand `busy` / `titleSuggestBusy`.

### AUTH-002 — P2 — **Partiel**

Garde production AUTH_URL. Ops proxy → V7.16.3.

### WS-003 — P3 — **Partiel**

API article renforcée. Autres handlers id-only → suite.

### QUAL-002 — P3 — **Reporté**

Découpage `run-session.ts` trop risqué pour cette version.

---

## Non-régression V7.16.1

Rate-limit login, auth avant diagnostic API, sanitize HTML, isolation workspace, CMS draft, tracker, anti double brouillon — conservés.

## Throttle recovery — note fiabilité

Intervalle 60 s hors boot uniquement. Boot (`fromBoot: true`) exécute toujours la recovery complète. Les jobs stale restent récupérés au plus dans la minute suivante ou au prochain démarrage serveur — pas de blocage définitif.

## Préparation V7.16.3 (non démarré)

BACKUP-001, INFRA, OBS-001, AUTH_URL ops, secrets, Docker, rollback, monitoring.
