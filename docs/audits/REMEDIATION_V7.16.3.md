# Remédiation V7.16.3 — Production readiness

**Baseline :** `v7.16.2` (`9d8fc4c8da942d94643832a6424cc3eb61bcdb0f`)  
**Publication :** tag `v7.16.3` — **aucun déploiement VPS** dans cette version.

## Recette technique (locale — ne vaut pas validation VPS)

| Contrôle | Résultat |
|----------|----------|
| Tests | **819 · 818 pass · 0 fail · 1 skipped** |
| Build / typecheck / lint | OK |
| `npm audit --omit=dev` | **0** |
| Image `naxialis-agent:v7.16.3-local` | `e10164b58f0f` · geo-guard RUN OK |
| Install neuve `naxialis-validate` | 37 migrations · health · login · dashboard · restart |
| Upgrade réel V7.16.2 → V7.16.3 | OK (données + decrypt + GEO stubs) |
| Rollback réel V7.16.3 → V7.16.2 | OK sans restore destructive |
| Restore PG + app isolées | OK |
| Main `naxialis_agent` | inchangée (16/10/6/119/5) |

## Matrice des constats résiduels

| ID | Gravité | Statut | Preuve | Risque résiduel | Bloquant VPS privé | Condition de clôture |
|----|---------|--------|--------|-----------------|--------------------|----------------------|
| BACKUP-001 | Haute | **Partiel** — tech local clos / ops VPS ouvert | Dump+SHA+tar images+restore+upgrade | Perte serveur sans copie externe | **Oui** ops | Timer + rétention + copie externe chiffrée + alertes + restore ops périodique |
| BACKUP-002 | Moyenne | **Corrigé** | Dumps hors Git (`backups/`) | — | Non | — |
| AUTH-002 | Haute | **Partiel** | Headers/tests locaux ; garde AUTH_URL | Proxy/HTTPS non smoke VPS | Non si validé avant cutover | Smoke HTTPS + cookies Secure + X-Forwarded-* derrière proxy réel |
| WS-003 | Haute | **Corrigé** (revue applicative) | Tests isolation / routes | WS-001 hors scope | Non | — |
| WS-001 | Critique SaaS | **Hors périmètre** | — | Multi-tenant | N/A | Traitement SaaS dédié (V8+) |
| INFRA-001 | Critique | **Corrigé** | geo-guard + Dockerfile RUN + drop absent | — | Non | — |
| INFRA-002/003 | Haute | **Corrigé** | docker-start : identité DB, refus migtest/bench, SKIP_PRISMA_MIGRATE | — | Non | — |
| INFRA-004 | Haute | **Partiel** | Doc + garde drop ; install neuve crée Visibility orphelines | Schéma VPS inconnu localement | **Oui** contrôle | Inventaire GEO/`_prisma_migrations` sur VPS avant deploy |
| OBS-001 | Moyenne | **Partiel** | `/api/health/live|ready` + logWarn + runbook | Pas d’alertes réelles | Non | Alertes disque/backup/health sur VPS |
| DOC-001 | Basse | **Corrigé** | `docs/operations/*` | — | Non | — |
| GOOG-003 | Moyenne | **Doc** | Procédure rotation | Secret cron non tourné | Non | Rotation réelle autorisée |
| QUAL-002 | Moyenne | **Ouvert / reporté** | Audits V7.16.0 | Dette qualité | Non | Correctifs ciblés hors V7.16.3 |
| AI-001 | Moyenne | **Partiel** | Draft-only + allowlist outils | Prompt injection résiduel | Non (draft-only) | Durcissement hors instructions agents |
| AI-003 | Basse | **Ouvert** | Doc revue tarifs | Dérive tarifs | Non | Revue périodique manuelle |
| DB-002/005 | Moyenne | **Ouvert / doc** | Audits DB | Edge cases intégrité | Non si backups OK | Correctifs additifs justifiés |

### Distinction

- **Risques applicatifs encore ouverts :** QUAL-002, AI-001 (résiduel), AI-003, DB-002/005.  
- **Vérifications opérationnelles VPS :** BACKUP-001 ops, AUTH-002 proxy/HTTPS, INFRA-004 inventaire réel, OBS-001 alertes.

Ne pas clôturer artificiellement un constat documenté sans preuve.

## GEO

- Drop `20261103173400_drop_ai_visibility_monitor` : **absent** Git tracked, disque workspace, contexte Docker, images, scripts deploy.  
- Dossier local gitignoré **retiré** du workspace pour `geo:guard` / build.  
- `.gitignore` / `.dockerignore` conservés.  
- 7 tables Visibility : créées sur install neuve ; **non utilisées** par le code actuel (`schema.prisma` sans modèles Visibility) ; **préservées** si présentes (stubs upgrade).  
- Aucune suppression · aucun falsification d’historique Prisma.

## BACKUP-001 — conditions ops restantes

1. Planification automatique (systemd/cron)  
2. Rétention (ex. 7/4/3)  
3. Copie externe chiffrée hors VPS  
4. Conservation sécurisée des clés de chiffrement  
5. Alertes d’échec  
6. Vérification périodique  
7. Test de restauration opérationnel  

Images à la une : **hors PostgreSQL** (`relativePath`) → archive `featured-images.tar.gz` obligatoire.
