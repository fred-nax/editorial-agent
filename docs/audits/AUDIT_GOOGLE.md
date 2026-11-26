# Audit Google GSC / GA4 — V7.16.0

**Aucune synchronisation réelle déclenchée** ; **aucune** propriété Webflow connectée.

---

## État configuré (PostgreSQL)

| Champ | Valeur |
|-------|--------|
| Workspace | `ws_wordpress_naxialis` |
| GSC | `sc-domain:naxialis.com` |
| GA4 | `399634894` |
| Sélections Webflow | **0** |
| `GscPageDailyStat` | 1582 |
| `Ga4PageDailyStat` | 640 |
| `GoogleConnection` | 1 |

---

## Contrôles code

- OAuth start/callback : `requireAuth` + state/nonce.
- Tokens chiffrés (`lib/google/crypto` via connection).
- Cron : Bearer secret, `timingSafeEqual`, skip si sync already_running, recover stale.
- Erreurs exposées : `sanitizeStoredGoogleError`.
- Trafic IA : classification heuristique — **ne pas** assimiler direct = IA (documenté produit).

---

## Constats

### GOOG-001 — INFO

- Webflow GSC/GA4 : **non évalué** (non configuré) — prérequis externe pour une validation complète multi-espace.

### GOOG-002 — P3 — Confiance moyenne

- Volumes stats élevés : risque perf agrégations (croisé PERF-001).
- Sync partielle : logique existante à ne pas régresser (tests Prisma migtest).

### GOOG-003 — P2 — Confiance moyenne (prod)

- Si `GOOGLE_SYNC_CRON_SECRET` faible ou fuité : déclenchement de syncs (coût quota / charge) — pas d’écriture CMS.
- **Correction :** secret long, rotation, réseau limité au scheduler.
- **Version :** V7.16.3.

---

## Non réalisé

- Sync manuelle ou cron réelle.
- Validation hostname filtering GA multi-sites en conditions Webflow.
