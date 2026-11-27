# Production readiness — V7.16.3

Validation technique finale locale terminée. Tag Git `v7.16.3` publié.  
**Aucun déploiement VPS exécuté.** Les preuves locales ≠ validation VPS.

---

## Décision

| Contexte | Statut | Notes |
|----------|--------|-------|
| Local | **GO** | Tests + backup/restore + upgrade/rollback isolés |
| VPS privé Naxialis | **GO sous conditions** | Niveaux B/C checklist |
| Instance dédiée client | **GO sous conditions** | Voir `CLIENT_INSTALLATION.md` |
| Exposition Internet large | **NO GO** / conditions strictes | BACKUP externe + monitoring + proxy |
| SaaS multi-tenant | **NO GO** | WS-001 |

---

## Conditions restantes avant déploiement VPS autorisé

1. GO humain explicite de déploiement  
2. Inventaire `_prisma_migrations` + tables Visibility sur le VPS réel  
3. Sauvegarde préalable + preuve de restaurabilité  
4. Timer sauvegardes + copie externe chiffrée + alerte d’échec  
5. `AUTH_URL` + HTTPS + cookies Secure + headers proxy  
6. Secrets production validés (pas de nouvelle clé de chiffrement silencieuse)  
7. Smoke niveau C post-déploiement  
8. Image précédente identifiable pour rollback applicatif  

---

## Preuves locales V7.16.3

- Restore PG → `naxialis_agent_restore_v7163` (16/10/6/119/5, Webflow `$1.023257`)
- Restore applicative → stack `naxialis-upgrade` (fichiers images + login + decrypt)
- Upgrade réel `v7.16.2-local` → `v7.16.3-local` OK
- Rollback réel `v7.16.3-local` → `v7.16.2-local` OK (sans restore destructive)
- Images Docker : `e10164b58f0f` (7.16.3) · `71a792e43890` (7.16.2)
- Drop GEO absent Git / disque / images ; stubs Visibility préservés à la MAJ
- Tests **819 · 818 pass · 0 fail · 1 skipped** · `npm audit --omit=dev` = 0
- Main `naxialis_agent` inchangée · `:4000` non arrêté

Voir `releases/V7.16.3-REPORT.md` et `docs/operations/PRODUCTION_CHECKLIST.md`.
