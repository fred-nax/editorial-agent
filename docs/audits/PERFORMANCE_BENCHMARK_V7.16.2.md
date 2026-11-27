# Benchmarks performance — V7.16.2

## Conditions

| Élément | Valeur |
|---------|--------|
| Dates | 2026-11-26 (baseline) · reconfirm 2026-11-27 |
| Matériel | Windows 10, PostgreSQL Docker `naxialis-agent-postgres-1` (postgres:16-alpine) |
| Base | **`naxialis_agent_bench_v7162`** uniquement — jamais `naxialis_agent` |
| Volume principal | Scale 5000 → **4200** générations WordPress synthétiques dans l’espace WP bench |
| Mode | Scripts Node/Prisma (`scripts/bench-probe-v7162.ts`) — **pas** `next dev` |
| Exécutions | ≥3 runs scale 1000 + ≥2 runs scale 5000 + reconfirm 2026-11-27 |
| Cold / hot | cold = 1ʳᵉ requête après connect ; hot = suivantes |

Les mesures portent sur la **couche Prisma/SQL** de l’historique. Elles ne représentent **pas** un gain de −91 % sur l’ensemble de l’application (HTML, auth, recovery, SEO, etc.).

## Jeu de données (scale 5000, état bench)

| Entité | Volume (indicatif) |
|---------|-------------------:|
| Générations WP+WF cumulées | 6000 |
| Dont WP (workspace mesuré) | **4200** |
| OpenAiUsageEvent | ~10k |
| WordPressPost synth. | 500 |
| WebflowCmsItem synth. | 200 |
| Marqueur | `SYNTHETIC_V7162` |

## Résultats — historique des générations (requête liste)

| Scénario | Requêtes | Scale ~1000 (700 WP) | Scale 5000 (**4200** WP) | Reconfirm 2026-11-27 |
|----------|----------|---------------------:|-------------------------:|---------------------:|
| **Avant** `findMany` sans `select` (comportement V7.16.1) | 1 unbounded | ~12 ms | **~37 ms** | ~91 ms (froid machine) |
| `findMany` unbounded + select liste | 1 unbounded | ~5 ms | ~12 ms | ~23 ms |
| **Après** `listArticleHistory` page 1 (**20**) | count + findMany borné | **~3,5 ms** | **~3,3 ms** | **~3,3 ms** hot |
| Après page 5 | idem | ~4 ms | ~4 ms | ~4 ms |

**Variation documentée (référence scale 5000, runs 2026-11-26) :**  
unbounded `select *` **~37 ms** → pagination+select **~3,3 ms** ≈ **−91 %** sur **cette requête d’historique**.

Limites : latence locale Docker ; pas de charge concurrente HTTP ; données synthétiques sans `trace` JSON massif (gain réel avec traces ≥) ; variation machine entre sessions (reconfirm froid ~91 ms vs ~37 ms médiane initiale — le ratio page bornée reste stable ~3 ms).

## Usage / inventaire (indicatif scale 5000)

| Scénario | ms (ordre de grandeur) |
|----------|----------------------:|
| `getUsageSummary` année | ~46–120 |
| `listUsageHistory` page 1 | ~31–33 |
| Inventaire WP take 20 | ~3,6–5 |

## Scripts

- `scripts/with-bench-db.mjs`
- `scripts/seed-benchmark-v7162.ts`
- `scripts/bench-probe-v7162.ts`
