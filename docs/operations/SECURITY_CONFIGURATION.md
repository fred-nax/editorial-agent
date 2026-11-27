# Configuration sécurité — production privée

## AUTH-002 — Reverse proxy

| Variable | Rôle |
|----------|------|
| `AUTH_URL` | URL publique HTTPS canonique (obligatoire en `NODE_ENV=production`) |
| `AUTH_SECRET` | Secret Auth.js |
| `AUTH_TRUST_HOST` | souvent `true` derrière proxy |
| `AUTH_TRUST_PROXY` | `1` **uniquement** si le proxy écrase `X-Forwarded-For` |

Par défaut, le rate-limit login **ignore** XFF (anti-usurpation). Voir `lib/auth/client-ip.ts`.

## Cookies / HTTPS

- Secure en production
- HttpOnly session Auth.js
- SameSite=lax (existant)

## En-têtes applicatifs (Next)

`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `HSTS` (prod).

CSP stricte : à durcir côté proxy après smoke (Next/Auth/graphiques).

## Secrets — cycle de vie

| Secret | Critique démarrage | Rotation |
|--------|-------------------|----------|
| `DATABASE_URL` | oui | change mot de passe PG + URL |
| `AUTH_SECRET` | oui | invalide sessions |
| `APP_SETTINGS_ENCRYPTION_KEY` | oui si settings chiffrés | **ne jamais régénérer silencieusement** |
| OpenAI / CMS / Google | facultatifs au boot | rotation manuelle |
| `GOOGLE_SYNC_CRON_SECRET` | cron 401 si absent | GOOG-003 |

Ne jamais générer une nouvelle clé de chiffrement qui rendrait illisibles les settings existants.
