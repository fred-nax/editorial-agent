# Monitoring et observabilité (OBS-001)

## Healthchecks

| Endpoint | Auth | Rôle |
|----------|------|------|
| `GET /api/health/live` | public | processus vivant |
| `GET /api/health/ready` | public | PostgreSQL joignable |

Ne pas utiliser OpenAI/CMS comme healthcheck périodique.

## Logs

- `lib/logger` : `info` / `warn` / `error`, horodatage ISO, sanitisation secrets
- Éviter de journaliser le HTML éditorial complet
- Rotation Docker : configurer `json-file` max-size / max-file côté daemon ou Compose (ops VPS)

## Seuils proposés (à brancher sur VPS)

| Signal | Seuil indicatif |
|--------|-----------------|
| HTTP 5xx | > 5 / 5 min |
| ready down | 2 échecs consécutifs |
| Dernière sauvegarde | > 36 h |
| Disque | < 15 % libre |
| Sync Google failed | 2 runs échoués d’affilée |
| Generations stuck running | > STALE_GENERATION_MS |

Alertes : mécanisme simple (script + mail/webhook existant) — **non branché** en V7.16.3.
