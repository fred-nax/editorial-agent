# OPS-03A — Diagnostic régression authentification API (V7.16.3)

**Instance :** https://agent-client-01.naxialis.com/  
**Date :** 2026-11-28  
**Version déployée :** V7.16.3 · `7976cc5` · image `56bf347a2982…`  
**Hors périmètre :** `agent.naxialis.com` (V7.8.1, **sans** `middleware.ts`)  
**OPS-04 :** suspendu  
**Déploiement correctif :** **non effectué** — en attente de validation.

---

## 1. Décision

| Élément | Statut |
|---------|--------|
| Cause racine | **Identifiée** (code) |
| Nature | Faux 401 middleware Edge `getToken` derrière proxy TLS |
| Données / Google tokens | **Intacts** — pas une déconnexion réelle |
| Correctif | **V7.16.4** validée **localement** (tokens Auth.js + Docker HTTPS) |
| Production | **Inchangée** (V7.16.3) jusqu’à GO publication/déploiement |

---

## 2. Constat utilisateur ↔ mécanisme

L’utilisateur est bien authentifié (layout `(protected)` via `auth()` RSC).  
Plusieurs blocs Paramètres chargent leurs données via `fetch('/api/…')` **client-side**.  
Ces appels passent par `middleware.ts` (AUTH-003, introduit V7.16.1, actif en V7.16.3) qui appelle :

```ts
getToken({ req, secret })  // secureCookie omis → défaut false
```

Sur HTTPS public, Auth.js émet `__Secure-authjs.session-token`.  
`getToken` sans `secureCookie: true` cherche `authjs.session-token`, ne trouve rien → **401** `{ error: "Non authentifié." }`.

Les sections affichent donc l’erreur API, alors que la session page est valide.

---

## 3. Routes concernées (chemins réels)

### 3.1 Paramètres — appels client observés / impliqués

| Section UI | Route(s) API | Symptôme attendu si middleware 401 |
|------------|--------------|-------------------------------------|
| Instructions éditoriales | `GET/POST /api/agent/instructions` | « Non authentifié. » |
| Catégories WordPress | `GET/POST /api/settings/categories`, `POST …/sync` | idem |
| Catégories / auteurs WP | `/api/wordpress-references` (+ variants) | idem |
| Connexion WordPress (actions) | `/api/settings/wordpress`, `…/test`, `…/acknowledge-inventory` | idem |
| Langue workspace | `/api/workspace/language` | idem |
| Google GSC / Analytics | `/api/google/status`, `/properties`, `/select`, `/sync`, `/disconnect` | erreur « Non authentifié. » + UI « Non connecté » si `status` null |
| SEO plugin (actions) | `/api/settings/seo-plugin`, `…/check` | idem |
| OpenAI (actions test/save) | `/api/settings/openai`, `…/test` | peut afficher config SSR initiale mais actions API en 401 |

OpenAI / WordPress « semblent présentes » : valeurs **SSR** via `getPublicAppSettings()` sur la page serveur — pas via ces API.

### 3.2 Preuve HTTP (session absente / même message middleware)

Sans cookie (diagnostic lecture seule) :

| Route | HTTP | Corps |
|-------|-----:|-------|
| `/api/agent/instructions` | 401 | `{"error":"Non authentifié."}` |
| `/api/google/status` | 401 | idem |
| `/api/settings/wordpress` | 401 | idem |
| `/api/settings/categories` | 401 | idem |
| `/api/settings/openai` | 401 | idem |
| `/api/workspace` | 401 | idem |

Le message **identique** à celui affiché en session prouve que le rejet vient du **middleware** (même libellé), pas d’un contrôle métier distinct.

### 3.3 Étendue hors Paramètres

**Toutes** les routes `/api/*` non publiques sont filtrées par le même middleware.  
Pages Next **accessibles** (HTML 200/307) ≠ API internes fonctionnelles.

| Zone | Page | API typiques impactées |
|------|------|------------------------|
| Dashboard | OK (RSC) | `/api/workspace`, génération, etc. |
| Nouvel article / historique | OK navigation | `/api/generate`, `/api/articles/…`, images |
| Inventaire | OK shell | `/api/wordpress-inventory/sync` |
| Analytics | OK shell | `/api/google/…`, metrics |
| Consommation | OK shell | `/api/usage` |
| Opportunités / veille | OK shell | `/api/opportunities…`, `/api/veille…`, topics |
| Intégrations | OK shell | `/api/settings/webflow…`, `/api/cms/…` |

`agent.naxialis.com` V7.8.1 : **pas** de `middleware.ts` → non touché par cette régression.

---

## 4. Cause racine (démontrée)

| Facteur | Preuve |
|---------|--------|
| Middleware AUTH-003 | Présent dans l’image V7.16.3 ; absent V7.8.1 |
| `getToken({ req, secret })` | `secureCookie` omis |
| Défaut Auth.js | `@auth/core/jwt.js` : `secureCookie ?? false` → cookie `authjs.session-token` · `salt = cookieName` |
| Cookie réel HTTPS | `__Secure-authjs.session-token` (Auth.js + `AUTH_URL=https://…`) |
| Proxy | nginx-proxy termine TLS ; upstream HTTP ; `X-Forwarded-Proto` **bien** positionné globalement |
| `AUTH_SECRET` | PRESENT (len 44) |
| `AUTH_URL` | `https://agent-client-01.naxialis.com` |
| `AUTH_TRUST_HOST` | `true` |
| Session RSC | `auth()` fonctionne → pages protégées OK |

**Classification :** requête authentifiée côté navigateur, **mauvaise résolution du JWT en middleware Edge** (nom/salt du cookie), **pas** un affaiblissement souhaitable des contrôles, **pas** un problème workspace/`x-naxialis-workspace-id` (le 401 survient **avant** les handlers).

Régression introduite fonctionnellement au déploiement V7.16.3 sur cette instance (premier passage en prod avec middleware AUTH-003 derrière ce proxy). Le bug est latent depuis V7.16.1 dans le code.

---

## 5. Incohérence Google « Non connecté » vs services « Connecté »

| Source | Mécanisme | Résultat |
|--------|-----------|----------|
| Bloc « État des services » | SSR `getServiceStatuses()` → `getGoogleConnection()` **DB** | `status=connected` + email → **Connecté** |
| Section Google | Client `fetch('/api/google/status')` → **401 middleware** | `status` reste null → UI **Non connecté** + alerte « Non authentifié. » |

Données PostgreSQL (lecture seule, sans secrets) :

- 1 `GoogleConnection` · `status=connected` · email présent · tokens chiffrés présents  
- 1 `GooglePropertySelection` WP · GSC `https://permisdexploitation.com/` · GA4 `483620950`

**Aucune réinitialisation OAuth nécessaire.** Les tokens n’ont pas été invalidés par cette régression.

---

## 6. Correctif proposé (V7.16.4)

### 6.1 Fichiers

| Fichier | Rôle |
|---------|------|
| `lib/auth/secure-cookie.ts` | **Nouveau** — `resolveSecureSessionCookie()` |
| `middleware.ts` | Passe `secureCookie` à `getToken` |
| `tests/middleware-secure-cookie-v7164.test.ts` | **Nouveau** — non-régression |

### 6.2 Comportement (renforcé)

1. `AUTH_URL`/`NEXTAUTH_URL` `https://` → **toujours** Secure (XFF `http` ignoré pour rétrogradation)  
2. URL `http://` → non-Secure (dev)  
3. Sans URL : requête https **ou** XFF `https` → Secure  
4. `NODE_ENV=production` sans AUTH_URL → Secure (pas de fallback permissif)  
5. Salt = cookieName Auth.js (chunks SessionStore OK)

Protections AUTH-003 **conservées**.

### 6.3 Validation technique locale (V7.16.4) — **terminée**

| Contrôle | Résultat |
|----------|----------|
| Tokens Auth.js réels (`encode`/`getToken`) | OK (absent / secret / expiré / XFF falsifié) |
| Suite migtest | **833** · **832 pass** · 0 fail · 1 skipped |
| Build / typecheck / prisma / geo-guard | OK |
| `npm audit --omit=dev` | **0** |
| Image `naxialis-agent:v7.16.4-local` | `19e0d40b9931` · drop GEO absent |
| Docker + nginx HTTPS + login réel | **OPS03A_HTTPS_VALIDATE_OK** |
| Unauth API | **401** |
| Auth API (instructions/google/settings/workspace/refs) | plus de faux 401 |
| Migration schéma | **Aucune** |

Détail : `releases/V7.16.4-REPORT.md`.

### 6.4 Recette production (après GO déploiement)

1. Image taguée `v7.16.4` sur **agent-client-01 uniquement**  
2. Login → `/api/agent/instructions` + `/api/google/status` (`connected` réel client)  
3. Unauth → 401  
4. Paramètres UI : instructions, catégories, WP, Google alignés avec services  
5. Intégrité 3/3/42 · 37 migs · 7 GEO · Permis d'exploitation  

### 6.5 Ce qui n’est **pas** le correctif

- Supprimer le middleware / contourner les 401 UI  
- Modifier `AUTH_SECRET` / retag `v7.16.3`  
- Reset Google OAuth / sync  
- Changer nginx VPS (XFF déjà corrects)

---

## 7. Risques

| Risque | Mitigation |
|--------|------------|
| Déploiement V7.16.4 | Rollback **image** vers V7.16.3 OK (pas de mig) |
| Spoof XFF | Priorité `AUTH_URL` ; prod Secure par défaut |
| Prod encore V7.16.3 | Symptômes Paramètres persistent jusqu’au déploiement |

---

## 8. Intégrité

Production client-01 : **V7.16.3 inchangée**.  
Validation locale isolée (migtest / validate-https).  
Pas de secret dans les rapports · pas de commit/push.

---

## 9. Nécessité V7.16.4

**Oui — obligatoire** pour corriger les faux 401 en production HTTPS.

Validation locale : **GO**. Publication et déploiement : **en attente d’autorisation**.

---

## 10. Prochaines étapes (après votre GO)

1. Autoriser **commit + tag `v7.16.4` + push**  
2. Autoriser **déploiement agent-client-01 uniquement**  
3. Recette Paramètres / Google en prod  
4. OPS-04 reste suspendu jusqu’à demande explicite  
