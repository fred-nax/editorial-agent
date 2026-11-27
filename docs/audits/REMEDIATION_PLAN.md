# Plan de remédiation — suivi post V7.16.3

Baseline audit V7.16.0 : photographie historique `AUDIT_GLOBAL.md` (conservée).

| Version | Statut |
|---------|--------|
| V7.16.1 | **Publiée** — sécurité / intégrité |
| V7.16.2 | **Publiée** — perf / deps |
| V7.16.3 | **Publiée (Git)** — production readiness locale ; **pas de deploy VPS** |

---

## V7.16.3 — synthèse

| ID | Statut | Bloquant VPS privé |
|----|--------|-------------------|
| BACKUP-001 | Clos tech / **ouvert ops** | **Oui** (ops) |
| BACKUP-002 | Corrigé | Non |
| AUTH-002 | Partiel (proxy VPS) | Non si smoke avant cutover |
| WS-003 | Corrigé (revue) | Non |
| WS-001 | Hors périmètre SaaS | N/A |
| INFRA-001/002/003 | Corrigé | Non |
| INFRA-004 | Partiel (inventaire VPS) | **Oui** (contrôle) |
| OBS-001 | Partiel (alertes) | Non |
| DOC-001 | Corrigé | Non |
| QUAL-002 | Reporté | Non |
| AI-001/003 | Partiel / ouvert | Non |
| DB-002/005 | Doc / ouvert | Non |
| GOOG-003 | Doc rotation | Non |

Détail : `REMEDIATION_V7.16.3.md` · `releases/V7.16.3-REPORT.md`.

---

## Suite

1. Pré-audit VPS **uniquement** après autorisation explicite.  
2. Déploiement VPS **uniquement** après GO explicite + checklist B.  
3. Ne pas démarrer V8 sans GO.
