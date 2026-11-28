# OPS-05 — Stabilisation production (agent-client-01)

**Statut du document :** **période d’observation ouverte** (ne pas clôturer)  
**Instance :** https://agent-client-01.naxialis.com/  
**Version actuelle :** V7.16.5 · commit `d6dcf96` · image `naxialis-agent:v7.16.5`  
**Période V7.16.4 observée :** du lancement OPS-05 jusqu’au cutover **2026-11-28 ~18:54 UTC**  
**Période V7.16.5 :** à compter du cutover (intervention graphique exceptionnelle)  
**Hors périmètre :** `agent.naxialis.com` V7.8.1  
**Décision finale :** **non rendue** — à établir après **7 jours d’observation réelle**

---

## 1. Période d’observation

| Élément | Valeur |
|---------|--------|
| Fenêtre planifiée | **2026-11-28 → 2026-12-05** (Europe/Paris) |
| Ouverture OPS-05 | **2026-11-28** (collecte baseline `17:43 UTC`) |
| Jours réellement observés à ce stade | **J0 (baseline uniquement)** |
| Rapport définitif | **après le 5 décembre 2026** (collectes J1–J7) |

**Ne pas interpréter ce fichier comme une clôture à 7/7.**  
Les sections « futur / à constater » restent explicitement non validées.

---

## 2. Baseline initiale (J0 — 2026-11-28)

Source : `/var/lib/naxialis-agent-client-01/ops05/2026-11-28/daily.json`

| Indicateur | Valeur |
|------------|--------|
| HTTPS live / ready | **200 / 200** |
| App | running · `naxialis-agent:v7.16.4` · RestartCount **0** · StartedAt `2026-11-28T12:41:31Z` |
| PostgreSQL | healthy |
| Disque | 51 % (39 G / 77 G) |
| Mémoire available | ~2182 MiB |
| Données | gens=3 · images=3 · wp=42 · migs=37 · geo=7 · WMI=0 · orphelins=0 · usageEvents=0 |
| Stuck jobs / OpenAI fail 24h | 0 / 0 |
| Logs 24h (approx. grep) | errors≈2 · prisma≈4 · auth≈0 · 500≈0 *(bruit baseline — surveiller tendance, pas incident critique)* |
| Dernière sauvegarde | `auto/20261128T142519Z` · SHA **ok** · **manuelle OPS-04** (≠ planifiée) |
| Auto backups | 1 · historiques ops* = 3 |
| Google client timer | **disabled** |
| Main | `naxialis-agent:v7.8.1` · StartedAt **`2026-11-16T22:26:48.101936043Z`** · Restart **0** |

Références OPS-04 / OPS-04B : sauvegarde quotidienne 03:00 Europe/Paris · rétention `DRY_RUN=0` · monitoring 5 min · restore mensuel planifié · Restic/n8n/Google client **non activés**.

---

## 3. Mécanismes de collecte (méthode)

Réutilise le monitoring OPS-04 + un collecteur quotidien léger (pas de Prometheus/Grafana).

| Mécanisme | Rôle |
|-----------|------|
| `naxialis-agent-client-01-monitor.timer` | checks 5 min (existant) |
| `naxialis-agent-client-01-ops05-collect.timer` | synthèse quotidienne **08:00 Europe/Paris** |
| `client01-ops05-collect.sh` | snapshot lecture seule → `/var/lib/naxialis-agent-client-01/ops05/<YYYY-MM-DD>/` |
| `client01-ops05-check-scheduled-backup.sh` | preuve journal systemd de la run **planifiée** |

### Fichiers produits par jour

- `daily.md` / `daily.json` — synthèse  
- `monitor-status.json` — état monitor  
- `alerts-tail.txt` — alertes locales simulées  
- `backup-journal-48h.txt` — journal backup  
- `auto-backups.txt` — liste `auto/`  
- `timers.txt` — échéances systemd  

### Commandes de contrôle

```bash
# Collecte immédiate
sudo /opt/naxialis-ops/client01/client01-ops05-collect.sh
sudo cat /var/lib/naxialis-agent-client-01/ops05/$(TZ=Europe/Paris date +%F)/daily.md

# Timers
systemctl list-timers 'naxialis-agent-client-01-*' --all

# Première sauvegarde PLANIFIÉE (après 29/11 03:00 Europe/Paris)
sudo /opt/naxialis-ops/client01/client01-ops05-check-scheduled-backup.sh \
  '2026-11-29 01:50:00 UTC' '2026-11-29 03:30:00 UTC'

# Intégrité dernière sauvegarde
LATEST=$(sudo cat /opt/backups/naxialis-agent-client-01/auto/LATEST)
sudo bash -c "cd \"$LATEST\" && sha256sum -c SHA256SUMS && ls -lah"

# Rétention / historiques protégés
sudo ls -la /opt/backups/naxialis-agent-client-01/
sudo env DRY_RUN=1 /opt/naxialis-ops/client01/client01-backup-retain.sh

# Monitoring
sudo cat /var/lib/naxialis-agent-client-01/monitor/status.json
sudo journalctl -u naxialis-agent-client-01-monitor.service -n 50 --no-pager

# Données (lecture seule)
sudo docker exec naxialis-agent-client-01-postgres-1 psql -U client01 -d agent_client_01 -Atc \
  'SELECT COUNT(*) FROM "ArticleGeneration";'

# Instance principale (preuve non-impact)
sudo docker inspect naxialis-agent-app-1 \
  --format 'Started={{.State.StartedAt}} Image={{.Config.Image}} Restart={{.RestartCount}}'
sudo crontab -l | grep naxialis-google
```

---

## 4. Contrôles — validés maintenant vs futurs

| Contrôle | État au lancement OPS-05 |
|----------|--------------------------|
| Baseline J0 capturée | **Validé** |
| Collecteur quotidien + timer 08:00 | **Installé** |
| Timer backup actif (next ~29/11 02:00 UTC) | **Confirmé** |
| Première sauvegarde **planifiée** réussie | **Futur** (29/11 03:00 Europe/Paris) |
| 7 sauvegardes quotidiennes planifiées | **Futur** |
| 7 jours monitoring sans incident critique | **Futur** |
| Comportement rétention multi-jours | **Futur** (J0 : 1 auto · 0 purge) |
| Restore mensuel auto | **Futur** (échéance **2026-12-06 05:00 Europe/Paris** / `04:00 UTC`) — **hors** fenêtre 7 jours |
| Restic / n8n / Google client | **Désactivés** (conservés) |
| Décision GO finale OPS-05 | **Futur** |

---

## 5. Première sauvegarde planifiée (attendu)

| Attendu | Détail |
|---------|--------|
| Horodatage cible | **2026-11-29 03:00 Europe/Paris** ≈ **02:00 UTC** (CET) |
| Preuve requise | journal `Starting naxialis-agent-client-01-backup.service` dans la fenêtre timer · stamp `…T02….Z` · exit 0 · SHA OK |
| Interdit | confondre avec `systemctl start` manuel OPS-04 (`20261128T142519Z`) |

À documenter dans le rapport final dès collecte post-exécution.

---

## 6. Utilisation réelle / intégrations

- Application laissée disponible pour usage éditorial normal.  
- **Aucun** déclenchement auto OpenAI / WP / Google / CMS par OPS-05.  
- Si l’utilisateur génère volontairement un article : contrôle **lecture seule** après coup (statut, workspace, brouillon WP, `OpenAiUsageEvent`, coûts, pas de publication auto).  
- WordPress : brouillons uniquement (règle inchangée).  
- Google client timer : **disabled** · cron main inchangé.

---

## 7. BACKUP-001 (rappel)

Reste **partiellement ouvert** tant que :

1. Copie hors-site (Restic) non validée  
2. Coffre clés indépendant non formalisé  
3. Alertes n8n réelles non branchées  
4. (+ OPS-05) preuve série de sauvegardes **planifiées** quotidiennes  

Socle local (timer, rétention armée, monitor, drill isolé, restore mensuel planifié) : déjà établi en OPS-04/04B.

---

## 8. Risques résiduels (ouverts)

- Pas de copie externe → RPO hors perte VPS non assuré  
- Backup images à chaud (best-effort)  
- Alertes externes absentes  
- Restore mensuel auto non encore exécuté  
- Bruit log prisma/error en baseline à surveiller  

---

## 9. Instance principale — preuve d’absence d’impact (J0)

| Champ | Valeur |
|-------|--------|
| Image | `naxialis-agent:v7.8.1` |
| StartedAt | `2026-11-16T22:26:48.101936043Z` |
| RestartCount | 0 |
| Cron Google | `10 5 * * * /usr/local/sbin/naxialis-google-sync-cron.sh` (inchangé) |

Toute divergence ultérieure devra être distinguée d’une intervention légitime hors OPS-05.

---

## 10. Journal quotidien (à remplir — ne pas inventer)

| Date | Disponibilité | Backup planifié | SHA | Disque | Mem | Restarts | Incidents | Données | Actions |
|------|---------------|-----------------|-----|--------|-----|----------|-----------|---------|---------|
| 2026-11-28 | 200/200 | n/a (manuel seul) | ok | 51% | 2182M | **1 planifié** (cutover V7.16.5) | intervention UI (voir §13) | 3/3/42/37/7 inchangés | baseline J0 + deploy V7.16.5 |
| 2026-11-29 | *à collecter* | *à constater* | | | | | | | |
| 2026-11-30 | *à collecter* | | | | | | | | |
| 2026-12-01 | *à collecter* | | | | | | | | |
| 2026-12-02 | *à collecter* | | | | | | | | |
| 2026-12-03 | *à collecter* | | | | | | | | |
| 2026-12-04 | *à collecter* | | | | | | | | |
| 2026-12-05 | *à collecter* | | | | | | | | |

---

## 11. Critères d’acceptation (rappel — évaluation finale seulement)

- Sept jours d’observation **effective**  
- Sauvegardes quotidiennes **planifiées** réussies  
- Aucune perte de données · pas d’orphelins · GEO préservées  
- Aucun incident critique non résolu · pas de restart inexpliqué  
- Pas de régression Auth.js · pas d’erreurs Prisma récurrentes croissantes  
- Monitoring fonctionnel · rétention conforme · main préservée  

**Décision finale attendue :** GO / GO sous conditions / NO GO — **après** clôture de la période.

---

## 12. Contraintes respectées au lancement

Aucun changement version · pas de déploiement · pas de migration · pas d’OpenAI/CMS/Google auto · pas Restic/n8n · pas de secret dans ce rapport · pas de commit/push · pas V8 · main non modifiée.

**Prochaine action recommandée :** le **29/11 après 03:15 Europe/Paris**, exécuter `client01-ops05-check-scheduled-backup.sh` + collecte quotidienne.

---

## 13. Intervention graphique exceptionnelle — V7.16.5 (2026-11-28)

| Champ | Valeur |
|-------|--------|
| Date / heure (UTC) | **2026-11-28** · stamp `20261128T185257Z` · app StartedAt `2026-11-28T18:54:34Z` |
| Nature | Modernisation page `/login` uniquement (UI / éditorial) |
| Ancienne version | V7.16.4 · `7345f0a` · image `sha256:828b176f5fbf…` |
| Nouvelle version | V7.16.5 · `d6dcf96` · image `sha256:072cbc9f76db…` |
| Redémarrage | **Planifié** — recreate conteneur **app** seulement |
| Interruption estimée | **~104 s** (stop app → backup cohérent → recreate → ready) |
| Healthchecks post | live **200** · ready **200** · `/login` **200** |
| Recette | Login UI OK · plateformes WP/Webflow · secureCookie préservé · API auth 200 · unauth 401 · dashboard 200 · intégrité données match |
| Sauvegarde pré | `/opt/backups/naxialis-agent-client-01/pre-v7165-20261128T185257Z` · SHA-256 OK · `.env` non copié |
| Monitoring | Timers backup / monitor / ops05-collect **inchangés** · **pas** de remise à zéro des compteurs |
| PostgreSQL / GEO / migrations | **37** migs · **7** tables GEO · counts inchangés |
| `agent.naxialis.com` | **Inchangé** (`naxialis-agent:v7.8.1` · StartedAt `2026-11-16T22:26:48Z`) |
| OPS-05 | **Reste ouverte** — distinguer désormais observation sous V7.16.4 vs V7.16.5 |
