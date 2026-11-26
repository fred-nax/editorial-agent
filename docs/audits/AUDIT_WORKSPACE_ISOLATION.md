# Audit isolation des espaces éditoriaux — V7.16.0

Baseline : `v7.15.1`.

---

## Modèle réel

Deux espaces (`ws_wordpress_naxialis`, `ws_webflow_ai_studio_01`) sous **un seul** utilisateur Auth.js.  
Cookie `naxialis_workspace` + header `x-naxialis-workspace-id` pour les écritures.  
Ce n’est **pas** une isolation multi-tenant SaaS (pas de principal distinct par workspace).

---

## Contrôles réalisés

- Lecture `lib/workspace/**`, layout cookie rewrite si workspace invalide.
- Intégrité SQL lecture seule :
  - `event_ws_mismatch = 0`
  - `image_ws_mismatch = 0`
  - `orphan_gens = 0`, `orphan_events = 0`
- Google : une seule `GooglePropertySelection` (WordPress) — pas de propriété Webflow.
- OpenAiUsageEvent V7.15.1 tous `ws_wordpress_naxialis`.
- Tests d’isolation existants (`tests/workspace-isolation-audit-v7113.test.ts`, UI v7112).

---

## Constats

### WS-001 — P2 — Confiance haute

- **Description :** tout utilisateur authentifié (le seul admin) peut basculer d’espace et accéder aux données des deux CMS.
- **Impact :** acceptable pour usage Naxialis privé ; **insuffisant** pour SaaS multi-client.
- **Preuve :** un seul `authorize` admin ; `listEnabledWorkspaces` sans ACL par rôle.
- **Correction (si SaaS un jour) :** authentification/autorisation par tenant — hors scope immédiat.
- **Version :** documenter clairement ; éventuel V8+ · complexité XL.

### WS-002 — INFO

- Génération fige le workspace initial (tests + code génération) — non ré-audité bout-en-bout runtime ici.
- Cookie httpOnly + secure prod.

### WS-003 — P3 — Confiance moyenne

- Certaines lectures Prisma peuvent s’appuyer sur `id` après résolution workspace en amont — pattern correct **si** le garde amont est toujours appelé.
- Risque de régression : nouvelle route oubliant le filtre → defense-in-depth (AUTH-003).

---

## Décision

**Validé pour espaces éditoriaux mono-utilisateur.**  
**NO GO** comme preuve de multi-tenant commercial.
