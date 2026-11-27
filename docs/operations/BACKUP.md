# Sauvegardes — Naxialis Content Agent

## Périmètre sauvegardé

| Élément | Méthode |
|---------|---------|
| PostgreSQL | `pg_dump -Fc` (custom) |
| Images à la une | archive `featured-images.tar.gz` (volume / `storage/featured-images`) — **hors PostgreSQL** (`ArticleFeaturedImage.relativePath`, pas de BLOB) |
| Métadonnées | `manifest.json` (SHA-256, version, compteurs) |

## Hors dump (sauvegarde secrets séparée chiffrée)

`AUTH_SECRET`, `APP_SETTINGS_ENCRYPTION_KEY`, clés Google OAuth, mots de passe CMS, `DATABASE_URL`, `ADMIN_PASSWORD_HASH`.

**Ne jamais** journaliser ni committer ces valeurs.

## Exécution locale

```bash
npm run backup:instance
# ou
APP_VERSION=$(git describe --tags --always) node scripts/backup/backup-via-docker.mjs
```

Variables : `POSTGRES_CONTAINER`, `DATABASE_NAME_GUARD` (défaut `naxialis_agent`), `BACKUP_ROOT`.

Scripts shell VPS : `scripts/backup/backup-instance.sh` (flock, rétention).

## Rétention indicative

- Quotidien : 7
- Hebdomadaire : 4 (à organiser ops)
- Mensuel : 3

Une copie **uniquement sur le même VPS** ne protège pas contre la perte du serveur — prévoir une copie externe chiffrée (non réalisée dans V7.16.3).

## Planification (préparée, non installée sur VPS)

- systemd timer ou cron quotidien (ex. 02:30 Europe/Paris)
- verrou anti-concurrence
- code de sortie ≠ 0 → alerte

## Ce qui n’est pas clos pour la production

- Timer réellement installé sur le VPS
- Copie externe chiffrée vérifiée
- Alertes d’échec de sauvegarde

→ Voir `PRODUCTION_CHECKLIST.md` niveaux B/C.
