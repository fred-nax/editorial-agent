# Sauvegarde et restauration — V7.16.0

---

## Distinctions

| Notion | Statut audit |
|--------|--------------|
| Sauvegarde documentée | Partielle (scripts/historiques `backups/`, docs déploiement) |
| Sauvegarde existante locale | Oui (dossier `backups/` non versionné — **non inspecté en contenu**) |
| Sauvegarde vérifiée (checksum/restore drill) | **Non** |
| Restauration réellement testée | **Non** (volontairement : pas de restore sur `naxialis_agent`) |

---

## Données nécessaires à une instance complète

1. Dump PostgreSQL (`naxialis_agent`) incluant `_prisma_migrations`.
2. Volume / répertoire `storage/featured-images` (et tout média local).
3. Secrets runtime : `AUTH_*`, `ADMIN_*`, `APP_SETTINGS_ENCRYPTION_KEY`, OpenAI, CMS, Google OAuth, `GOOGLE_SYNC_CRON_SECRET`, `DATABASE_URL`.
4. Version image / commit Git déployé.
5. Config reverse-proxy (`AUTH_URL`, TLS).

---

## Constats

### BACKUP-001 — P1 — Confiance haute

- **Description :** aucune preuve dans cet audit qu’une restauration complète a été exécutée avec succès sur une base **isolée**.
- **Impact :** en incident, RTO/RPO inconnus ; risque de perte ou restore destructif.
- **Correction :** procédure écrite + exercice restore → `naxialis_agent_restore_audit_*` neuve ; checklist ; rétention.
- **Version :** V7.16.3 · complexité M.
- **Critère d’acceptation :** restore drill documenté avec compteurs tables + login + 1 lecture `/usage`.

### BACKUP-002 — P2

- Protéger les dumps (secrets potentiels dans SQL si mal filtrés) ; ne pas committer `backups/`.

---

## Interdits rappelés

- Jamais restore par-dessus `naxialis_agent` sans GO.
- Jamais supprimer volumes Docker production.
- Jamais `prisma migrate reset` sur la principale.
