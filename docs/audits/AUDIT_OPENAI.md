# Audit OpenAI / agents / coûts — V7.16.0

Baseline : `v7.15.1`. **Aucun appel OpenAI** pendant l’audit.

---

## Inventaire (code)

| Zone | Rôle |
|------|------|
| `lib/agent/run-session.ts` | Session Agents + tools draft |
| `lib/agent/registry.ts` | Agents WP / Webflow |
| `lib/images/generate.ts` / `alt-text.ts` | Image + ALT |
| `lib/veille/*`, `lib/seo/*`, `lib/titles/*`, `lib/topics/*` | Responses API |
| `lib/openai-usage-tracker.ts` | Persistance |
| `lib/openai-pricing.ts` | Catalogue `v7150-2026-11-25` |

Prompt image : **local** (`buildFeaturedImagePrompt`) — pas d’event attendu.

---

## Contrôles réalisés

- Tools draft : schémas + exécution serveur (`createWordPressDraft` / Webflow `isDraft: true`).
- Allowlist Webflow paths refuse `/publish`.
- Tracker : idempotence, ne throw pas vers métier, `usageTracking` sur échec (V7.15.1).
- Preuve PG : 4 events article `cmwwpe0ae0000r8ax1ushxtih`, total **0.158824**, pas de double comptage UI.
- Incident V7.15.0 : UI legacy ≠ registre — documenté ; corrigé en provenance UI V7.15.1.

---

## Constats

### AI-001 — P2 — Confiance moyenne

- **Description :** contenus externes (web_search, pages) entrent dans le contexte agent → risque résiduel de prompt injection.
- **Mitigation existante :** outils CMS exécutés côté serveur avec allowlist ; pas de publication.
- **Impact :** détournement éditorial / tentatives d’exfiltration via contenu — credentials non exposés à l’agent comme variables librement utilisables (à maintenir).
- **Correction :** durcir filtres d’entrée outil ; tests adversariaux hors prod.
- **Version :** V7.16.2 · complexité M.

### AI-002 — INFO

- Completeness `partial` sur LLM/web_search : conception (hors images / couverture outil).
- Estimations ≠ facture OpenAI.

### AI-003 — P3

- Vérification continue des tarifs vs documentation OpenAI non automatisée dans CI.
- **Version :** V7.16.2 · revue périodique.

### AI-004 — INFO (validation V7.15.1)

| Opération | Coût | Completeness |
|-----------|-----:|--------------|
| article_generation | 0.136369 | partial |
| web_search | 0.010000 | partial |
| image_generation | 0.011305 | complete |
| image_alt | 0.001150 | complete |

### AI-005 — P2 — Confiance haute

- **Description :** chemins d’échec session (`turn_failed` / annulation / erreur pendant draft) et certaines erreurs Responses **ne persistent pas** toujours de consommation ; marqueur `usageTracking` incomplet sur certains échecs LLM.
- **Preuve :** revue tracker/génération ([OpenAI CMS Google audit](7bb5dc5d-70a0-4761-be6d-c5c016714e70)).
- **Impact :** sous-déclaration des coûts (pas de double facturation OpenAI automatique).
- **Version :** V7.16.2 · complexité M.

### AI-006 — P2 — Confiance moyenne

- **Description :** double appel outil draft possible dans une même session → risque de **deux brouillons** CMS.
- **Version :** V7.16.2 (lié CMS-001) · complexité M.

### AI-007 — P3

- Après succès draft, un échec de collecte d’usage / update DB peut marquer la génération `failed` alors que le brouillon CMS existe.
- **Version :** V7.16.2 · complexité M.

---

## Non réalisé

- Comparaison ligne à ligne de tous les tarifs avec les pages pricing OpenAI du jour.
- Chaos tests retries (double draft / double billing) en conditions réelles.
