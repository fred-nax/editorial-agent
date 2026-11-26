# Audit sécurité — V7.16.0

Réf. méthodologie : **OWASP ASVS 5.0.0** (inspiration, non certification).  
Baseline : `v7.15.1` (`fff9c6d`).

---

## Contrôles réalisés

- Lecture `auth.ts`, `lib/require-auth.ts`, `app/(protected)/layout.tsx`.
- Inventaire `app/api/**/route.ts` (71 fichiers) ; présence de `requireAuth` (sauf cron Bearer + Auth.js).
- Sondages locaux non authentifiés contre `:4000` : `POST /api/generate` → **401**, `GET /api/usage` → **401**, `GET /dashboard` → **307**, `POST /api/google/sync/cron` sans Bearer → **401**.
- Recherche `dangerouslySetInnerHTML` / `__html` : **aucun** résultat.
- Recherche `NEXT_PUBLIC_` dans le code applicatif : **aucun** usage de secret public.
- Cron Google : `timingSafeEqual` + refus si secret absent.
- CSV : `csvSafeCell` garde `=+-@`.

---

## Matrice API (synthèse)

| Catégorie | Auth | Notes |
|-----------|------|-------|
| Métier (generate, articles, topics, veille, opportunities, inventaires, settings, usage, images, workspace, agent instructions, CMS test) | `requireAuth` | Vérifié par grep fichier + sondages |
| `GET/POST google/*` (hors cron) | `requireAuth` | OAuth start/callback inclus |
| `POST /api/google/sync/cron` | Bearer `GOOGLE_SYNC_CRON_SECRET` | Pas de session utilisateur |
| `app/api/auth/[...nextauth]` | Auth.js | Public login handlers |

**Contrôle non exhaustif ligne-à-ligne de chaque handler** : la matrice complète serait redondante ; les absences de `requireAuth` hors cron/auth n’ont **pas** été trouvées.

---

## Constats

### AUTH-001 — P1 — Confiance haute

- **Fichier :** `auth.ts` (Credentials `authorize`, ~L52–75) ; absence de module rate-limit.
- **Description :** aucune limitation de tentatives / lockout / captcha sur le login admin unique.
- **Preuve :** pas de `rateLimit`/`failedAttempts`/`lockout` dans le code auth ; ASVS v5.0.0 attend une protection contre l’abus d’authentification.
- **Impact :** brute-force hors bande si l’instance est exposée.
- **Correction proposée :** rate-limit IP + délai progressif et/ou fail2ban / allowlist réseau ; journalisation des échecs.
- **Version :** V7.16.1 · complexité M.

### AUTH-002 — P2 — Confiance moyenne

- **Fichier :** `auth.ts` L39 `trustHost: true`.
- **Description :** confiance hôte élargie ; doit être compensée par `AUTH_URL` / reverse-proxy correctement configurés.
- **Impact :** risques de mauvaise construction d’URL / host header en prod mal configurée.
- **Correction :** documenter `AUTH_URL` obligatoire ; tests config proxy.
- **Version :** V7.16.1 / V7.16.3 · complexité F.

### AUTH-003 — P2 — Confiance moyenne

- **Fichier :** absence de `middleware.ts` ; protection via layout + `requireAuth` route.
- **Description :** défense en profondeur limitée — une nouvelle route API oubliée pourrait être exposée.
- **Preuve :** `Glob **/middleware.ts` → 0 ; layout protège les pages `(protected)` uniquement.
- **Correction :** middleware matcher API + pages, ou générateur de garde.
- **Version :** V7.16.1 · complexité M.

### SEC-001 — P2 — Confiance moyenne

- **Description :** session JWT Auth.js sans `maxAge`/`updateAge` explicites dans `auth.ts`.
- **Impact :** durée de session dépend des défauts Auth.js — à figer pour la prod.
- **Version :** V7.16.1 · complexité F.

### AUTH-004 — INFO

- Cookies workspace : `httpOnly`, `sameSite: "lax"`, `secure` en production (`lib/workspace/context.ts` L154–162).
- Mot de passe : `bcrypt.compare` ; hash via `ADMIN_PASSWORD_HASH`.
- Pas d’inscription publique (conforme CDC).
- Inventaire API (71 fichiers) : aucune route d’écriture sans auth/secret — confirmé par revue handler ([Map API routes and auth](dd9ba31a-1726-4ab3-990d-d77add5456bf)).

### AUTH-005 — P3 — Confiance haute

- **Fichier :** `auth.ts` L62–64 — rejet email avant `bcrypt.compare`.
- **Description :** oracle de timing faible sur l’email admin.
- **Impact :** confirmation de l’email cible pour un attaquant réseau (faible sans rate-limit — aggravé par AUTH-001).
- **Correction :** comparer toujours le hash (dummy hash si email faux) ; combiner avec rate-limit.
- **Version :** V7.16.1 · complexité F.

### SEC-002 — P2 — Confiance haute

- **Fichier :** `app/api/agent/instructions/route.ts` L29–37 / L46–54.
- **Description :** `requireAuth()` est appelé mais **n’interrompt pas** si session absente ; un 503 « OpenAI non configuré » peut être renvoyé **avant** le 401 métier, divulguant l’état de configuration à un client non authentifié.
- **Preuve :** ordre du code — `resolveAgentContext()` puis early `503` sans garde `if (!session)`.
- **Impact :** reconnaissance (config OpenAI absente/présente selon chemin).
- **Correction :** `if (!session) return 401` immédiatement après `requireAuth`.
- **Version :** V7.16.1 · complexité F.

### SEC-003 — P2 — Confiance moyenne

- **Description :** routes OpenAI payantes (session requise) sans throttle applicatif — abus de quota si session compromise ou admin malveillant.
- **Preuve :** absence de rate-limit hors retries amont ([Map API routes and auth](dd9ba31a-1726-4ab3-990d-d77add5456bf)).
- **Version :** V7.16.1 / V7.16.2 · complexité M.

### SEC-004 — P3 — Confiance haute

- **Fichier :** `.gitignore` ne liste que `.env` (pas `.env.local` / `.env.*.local`).
- **Impact :** risque de `git add` accidentel de secrets locaux (fichier actuellement untracked).
- **Correction :** ignorer `.env*` sauf `.env.example` ; vérifier `.dockerignore` (fichiers `password*.txt`).
- **Version :** V7.16.1 · complexité F.

### XSS / injection — INFO / P3

- Pas de `dangerouslySetInnerHTML` côté Next.
- HTML éditorial légitime pour CMS ; sanitisation partielle maillage (`sanitizeInternalLinks`) et Webflow `javascript:` URL check.
- **CMS-005** : contenu HTML WordPress issu du LLM **non** validé côté connecteur (XSS stockée **dans WordPress** si le compte WP autorise HTML non filtré) — voir AUDIT_CMS.
- SQL : Prisma paramétré — pas d’injection SQL démontrée.
- **QUAL UX :** revue a11y/XSS DOM runtime non exhaustive → UX-001.

### Secrets — INFO

- Chiffrement AppSettings / Google tokens présent.
- `.gitignore` contient `.env` (insuffisant — SEC-004).
- **Ne pas** logger les valeurs ; aucune valeur secrète reproduite ici.
- Si un secret était jamais commitité historiquement : rotation manuelle requise (non effectuée).

### SEC-005 — P2 — Confiance moyenne (SSRF)

- Validation d’URL WordPress surtout à l’enregistrement / test ; fetches ultérieurs avec credentials.
- Lacunes IPv4-mappées / plages réservées signalées en revue code ([OpenAI CMS Google audit](7bb5dc5d-70a0-4761-be6d-c5c016714e70)).
- **Version :** V7.16.1 · complexité M.

---

## Contrôles non réalisés

- Fuzzing authentifié IDOR exhaustif.
- Analyse dynamique XSS sur tous les aperçus HTML.
- Audit reverse-proxy Nginx VPS.
- Force-bruteforce réel (interdit / non pertinent).
