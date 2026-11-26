# Audit tests — V7.16.0

---

## Exécution audit

| Commande | Résultat |
|----------|----------|
| `npm run typecheck` | OK |
| `npm test` (DATABASE_URL=migtest) | **759 pass / 0 fail / 1 skipped** |
| `RUN_EXTERNAL_TESTS` | **non** activé |

76 fichiers `*.test.ts` · ~760 cas exécutés.

---

## Forces

- Forte couverture isolation workspace, Webflow allowlist, AppSettings, Google upserts Prisma, usage tracker migtest (V7.15.x).
- Tests source-level (grep routes `requireAuth`) utiles mais insuffisants seuls.

---

## Constats

### TEST-001 — P2 — Confiance haute

- **Description :** les suites n’ont pas empêché l’illusion V7.15.0 (UI legacy vs 0 `OpenAiUsageEvent` sur `naxialis_agent`) ni l’incident client Prisma V7.14.1.
- **Cause :** mocks / assertions structurelles / DB de test ≠ preuve de persistance sur la base réellement servie par Next.
- **Correction :** smoke « process Next + `current_database` + compteur events » en CI isolée ; garde client Prisma déjà renforcée.
- **Version :** V7.16.2 · complexité M.

### TEST-002 — P3

- Peu de tests de rate-limit auth / middleware.
- Concurrence génération/sync : couverture partielle.
- Skipped : 1 (justifié — à conserver documenté).

### TEST-003 — INFO

- Tests Prisma migtest bien gardés (`migtest` dans URL) — ne pas pointer `naxialis_agent`.

---

## Décision

Batterie **utile** mais **non suffisante** comme seule preuve production.  
À renforcer selon TEST-001.
