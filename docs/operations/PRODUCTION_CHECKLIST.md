# Checklist production — trois niveaux

## Niveau A — Validé localement (V7.16.3)

- [x] Suite tests automatisés (**819 · 818 pass · 1 skipped**)
- [x] typecheck / lint / build
- [x] `npm audit --omit=dev` = 0
- [x] Garde drop GEO (`geo:guard` + RUN image)
- [x] Sauvegarde dump + manifeste + SHA-256
- [x] Archive images hors PostgreSQL (`featured-images.tar.gz`)
- [x] Restauration PG isolée (`naxialis_agent_restore_v7163`)
- [x] Restauration applicative isolée (stack upgrade : boot + login + decrypt)
- [x] Coûts Webflow `$1.023257` / events dernier article `$0.158824`
- [x] Healthchecks live/ready (V7.16.3)
- [x] Headers sécurité Next (nosniff, Referrer, X-Frame, Permissions-Policy, HSTS prod)
- [x] Image Docker `naxialis-agent:v7.16.3-local` (`e10164b58f0f`)
- [x] Image Docker `naxialis-agent:v7.16.2-local` (`71a792e43890`) pour rollback
- [x] Installation neuve isolée (`naxialis-validate`)
- [x] Mise à jour isolée réelle V7.16.2 → V7.16.3
- [x] Rollback applicatif isolé V7.16.3 → V7.16.2
- [x] Préservation stubs GEO sur MAJ
- [x] Tear-down stacks de validation uniquement

## Niveau B — Préparé, non vérifié sur VPS

- [ ] Reverse proxy réel + HTTPS
- [ ] `AUTH_URL` / cookies Secure derrière proxy
- [ ] Secrets production (inventaire + rotation documentée)
- [ ] Migrations + tables GEO réelles VPS
- [ ] Timer sauvegardes
- [ ] Copie externe chiffrée
- [ ] Alertes (backup, disque, health, jobs)
- [ ] Durcissement CSP côté proxy (si pertinent)
- [ ] Rotation logs Docker / Nginx / PostgreSQL

## Niveau C — Après déploiement autorisé

- [ ] Healthchecks réels
- [ ] Login HTTPS
- [ ] Persistance
- [ ] Intégrations configurées (sans écriture de test non autorisée)
- [ ] Monitoring
- [ ] Sauvegardes automatiques constatées
- [ ] Absence d’erreurs récurrentes
- [ ] Rollback image identifiée disponible

**Rappel :** B et C ne sont **pas** validés par la seule documentation.
