# Audit CMS WordPress / Webflow — V7.16.0

**Aucune écriture distante** pendant l’audit.

---

## WordPress

### Contrôles code

- `lib/wordpress.ts` `createWordPressDraft` force `status: "draft"` (L126).
- Connecteur `lib/cms/wordpress-connector.ts` réutilise ce chemin.
- Inventaire local : **119** `WordPressPost`.
- Application Password / URL côté serveur (AppSettings chiffré).

### Constats

#### CMS-001 — P2 — Confiance moyenne

- **Description :** en cas de timeout après création réussie côté WP, un retry agent peut créer un **second brouillon**.
- **Preuve :** comportement réseau classique ; pas de clé d’idempotence WP native dans le connecteur audité.
- **Impact :** doublons de brouillons (coût éditorial / CMS), pas de publication auto.
- **Correction :** idempotency key / détection post existant avant recreate.
- **Version :** V7.16.2 · complexité M.

#### CMS-002 — INFO

- Pas de chemin code trouvé forçant `status: publish` à la création.
- Statuts `publish` dans le code = **filtres inventaire / analytics**, pas publication.

#### CMS-005 — P2 — Confiance moyenne

- **Description :** le HTML WordPress issu du LLM n’est pas sanitizé anti-XSS côté connecteur (contrairement à des garde-fous Webflow partiels).
- **Impact :** XSS **stockée dans WordPress** si le rôle Application Password autorise du HTML non filtré — hors surface Next (pas de `dangerouslySetInnerHTML`).
- **Correction :** sanitize allowlist HTML à la création ; principe moindre privilège du compte WP.
- **Version :** V7.16.1 / V7.16.2 · complexité M.

#### CMS-006 — P3

- SSRF / validation URL : contrôles surtout à l’enregistrement (voir SEC-005).

---

## Webflow

### Contrôles code

- `assertWebflowAllowedRequest` refuse live/publish/unpublish (sauf GET items/live).
- Création POST items exige `isDraft === true` et `isArchived === false`.
- Inventaire : **5** `WebflowCmsItem`.

### Constats

#### CMS-003 — INFO

- Isolation site/collection dépend de la config workspace — non rejouée contre API live.
- Recette site publié Webflow : **non évaluée** ici.

#### CMS-004 — P3

- Tokens Webflow : ne jamais les logger ; uploads assets à surveiller (URL temporaires).

---

## Décision domaine

**Validé au niveau code (brouillons only).**  
Recettes distantes et idempotence réseau : **à renforcer**.
