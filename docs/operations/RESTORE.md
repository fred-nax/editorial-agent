# Restauration — Naxialis Content Agent

## Interdits

- Jamais restaurer vers `naxialis_agent` (production locale / VPS).
- Jamais `ALLOW_DROP_TARGET` sur une base sans confirmation humaine.
- Jamais déclencher sync Google / OpenAI / CMS depuis une instance restaurée de test.

## Procédure isolée

```bash
CONFIRM_RESTORE=YES \
ALLOW_DROP_TARGET=YES \
TARGET_DATABASE=naxialis_agent_restore_v7163 \
BACKUP_DIR=./backups/<stamp> \
npm run restore:instance
```

Contrôles :

1. SHA-256 du dump vs manifeste
2. Nom de base cible (doit contenir `restore|migtest|bench`)
3. Compteurs vs manifeste
4. Coûts Webflow historiques
5. Lecture applicative éventuelle avec `ALLOW_MIGTEST_DATABASE=1` et `DATABASE_URL` pointant vers la base restore (validation uniquement)

## Preuve V7.16.3 (locale)

- Dump : `backups/20261127T105950Z`
- Cible : `naxialis_agent_restore_v7163`
- Compteurs : 16 / 10 / 6 / 119 / 5
- Base principale inchangée après restore
