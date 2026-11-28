# OPS-03 — Recette production agent-client-01 (V7.16.3)

**Domaine :** https://agent-client-01.naxialis.com/  
**Date :** 2026-11-28  
**Version :** V7.16.3 · commit `7976cc57191ef301fcf6651ab6f4397ac5eacbe2` · image `sha256:56bf347a2982…`  
**Prérequis :** OPS-02 validée  
**Ce rapport ne constitue pas une autorisation OPS-04.**

---

## 1. Décision

| Élément | Statut |
|---------|--------|
| Contrôles pré-réouverture | **OK** |
| Réouverture des écritures | **Effectuée** |
| Recette technique (read-only / unauth + données) | **OK** |
| Sécurité de base | **OK** |
| Appels OpenAI / CMS / Google pendant OPS-03 | **Aucun** |
| Impact `agent.naxialis.com` | **Aucun** |
| OPS-04 | **Non démarré** — inventaire seulement |

---

## 2. Marker `OPS02_WRITES_FROZEN`

| Question | Résultat |
|----------|----------|
| Rôle réel | **Flag opérationnel hôte uniquement** (`/opt/naxialis-agent-client-01/OPS02_WRITES_FROZEN`) |
| Lu par l’application ? | **Non** — non monté dans le conteneur · aucune env `MAINTENANCE` / `WRITES_FROZEN` |
| Mécanisme de gel effectif OPS-02 | `docker compose stop app` pendant backup/migrate ; app déjà en service depuis le démarrage V7.16.3 |
| Action OPS-03 | Renommé → `OPS02_WRITES_FROZEN.removed-at-20261128T114545Z` (conservé) |
| Preuve réouverture | Fichier `OPS03_WRITES_REOPENED` créé |

**Heure de réouverture (UTC) :** `2026-11-28T11:45:48Z`  
**Heure locale (Europe/Paris) :** `2026-11-28 12:45:48 CET`

Gel levé au sens opérationnel (marker retiré). Aucune tâche externe client-01 n’a été (ré)activée.

---

## 3. Contrôles avant réouverture (confirmés)

| Contrôle | Résultat |
|----------|----------|
| Conteneur app | `running` · `naxialis-agent:v7.16.3` · digest `56bf347a2982…` |
| PostgreSQL | `healthy` · DB `agent_client_01` · ports publiés **`{}`** · réseau `agent-client-01-internal` seul |
| `/api/health/live` / `ready` | **200** / **200** |
| HTTPS `/login` | **200** |
| Routes privées sans session | `/dashboard` **307** (redirection auth) |
| Migrations | **37** · drop GEO **0** |
| Tables GEO | **7** |
| Générations / images / WP | **3** / **3** / **42** |
| Workspace WP | **Permis d'exploitation** · `siteUrl`/`gscPublicSiteUrl`/`wpUrl` = `https://permisdexploitation.com` · id `ws_wordpress_naxialis` |
| Agent OpenAI | présent (`agent=true`) |
| WP encrypted / SEO | `wpEnc=true` · `yoast_seo` |
| Google | GSC `https://permisdexploitation.com/` · GA4 `483620950` |
| Webflow | non configuré (`wf=false`, 0 items) |
| Logs récents bloquants | **aucun** motif FATAL/migrate failed |
| Sauvegarde OPS-02 SHA-256 | **OK** (`ops02-pre-v7163-20261128T113434Z`) |
| Auth proxy | API métier **401** sans cookie · pages protégées **307** · `AUTH_URL=https://agent-client-01.naxialis.com` |

---

## 4. Smoke / recette technique

### 4.1 Routes applicatives (unauthenticated)

| Route | HTTP | Attendu |
|-------|-----:|---------|
| `/login` | 200 | public |
| `/dashboard` `/articles` `/articles/new` `/inventory` `/topics` `/veille` `/opportunities` `/analytics` `/usage` `/settings` `/settings/integrations` | 307 | auth gate |
| `/articles/{id}` × 3 | 307 | auth gate |
| `/api/health/live` `/ready` | 200 | public health |
| `/api/auth/csrf` | 200 | Auth.js |
| `/api/generations` `/api/settings` | 401 | API privée |

Pages présentes dans l’image : dashboard, articles (+ détail + new), inventory, topics, veille, opportunities, analytics, usage, settings, integrations, login.

### 4.2 Données PostgreSQL

| Entité | Compteur |
|---------|---------:|
| ArticleGeneration | 3 (toutes `completed`, workspace WP) |
| ArticleFeaturedImage | 3 (`attached`, workspace WP) |
| WordPressPost | 42 (hôte **uniquement** `permisdexploitation.com`) |
| Topic / CustomTheme / Watch / SeoOpportunity | 4 / 3 / 2 / 13 |
| GSC / GA4 daily | 241 / 42 |
| OpenAiUsageEvent | 0 (table V7.15+ ; coûts historiques sur générations) |
| WebflowCmsItem | 0 |
| WorkspaceMigrationIssue | 0 |
| AuthLoginAttempt | 0 (table présente — infra rate-limit) |

**URL effective workspace WP :** `https://permisdexploitation.com` — **pas** `naxialis.com`.  
Références `naxialis.com` dans champs texte/JSON des 3 générations : **0**.  
`wpUrl` des 3 articles : `https://permisdexploitation.com/?p=…`.

### 4.3 Images

| Contrôle | Résultat |
|----------|----------|
| Lignes DB | 3 · `relativePath` `.webp` · status `attached` |
| Fichiers volume | **3** sous `/app/storage/featured-images/…` |
| Workspace | toutes `ws_wordpress_naxialis` |

### 4.4 Intégrations

| Intégration | État |
|-------------|------|
| WordPress client | URL + credentials encryptés préservés · **aucune écriture distante** pendant OPS-03 |
| Google GSC/GA4 | propriétés client préservées · **aucune sync** déclenchée |
| OpenAI agent | id présent · **aucun appel payant** |
| Webflow | non configuré · pas de token · 0 inventaire |

### 4.5 Isolation workspaces

| | WordPress WS | Webflow WS |
|--|-------------:|-----------:|
| Générations | 3 | 0 |
| Images | 3 | 0 |
| WordPressPost | 42 | 0 |

### 4.6 Connexion / déconnexion / UI authentifiée

Non rejouée de bout en bout ici (pas de test credentials / pas de force brute).  
**Checklist utilisateur** §10 pour validation manuelle post-login.

### 4.7 Anciens contenus HTML

Le corps HTML complet n’est pas une colonne `ArticleGeneration` (contenu CMS côté WordPress + métadonnées locales).  
Preuve locale : articles `completed`, titres présents, `wpUrl` client, pages `/articles/[id]` protégées et routées.  
Rendu WYSIWYG/HTML en session : à confirmer manuellement (§10).

---

## 5. Sécurité

| Contrôle | Résultat |
|----------|----------|
| Inscription publique | **Non** (pas de texte signup/register sur `/login` ; pas de route signup exposée) |
| Auth obligatoire | pages protégées **307** · APIs **401** |
| Cookies | `__Host-authjs.csrf-token` + `__Secure-authjs.callback-url` · **Secure=TRUE** · **HttpOnly** |
| `AUTH_URL` | `https://agent-client-01.naxialis.com` |
| Rate-limit login | table `AuthLoginAttempt` **présente** (V7.16.3) |
| PostgreSQL public | **non exposé** (`Ports={}` · internal only) |
| Secrets dans logs/rapport | **non** (redaction) |
| Fuite inter-workspaces | compteurs isolation OK · Webflow vide |
| Test force brute | **non effectué** |

Proxy (jwilder) : compatible avec redirections Auth.js (307) et health publics ; pas de redémarrage proxy pendant OPS-03.

---

## 6. Logs

| Source | Observation |
|--------|-------------|
| `docker logs` app (~90 min) | pas de ligne error/fatal/exception retenue après filtre |
| Health | live/ready stables après réouverture |

---

## 7. Tâches planifiées (inventaire — aucune réactivation)

| Tâche | Cible | Action OPS-03 |
|-------|-------|---------------|
| Cron `naxialis-google-sync-cron.sh` (10:05 UTC) | **`https://agent.naxialis.com/api/google/sync/cron`** uniquement | **Non modifié** · hors périmètre client-01 |
| Cron aitracking | autres apps VPS | **Non touché** |
| Timer/cron backup `agent-client-01` | **aucun hit** dans cron.d / systemd | reste à traiter en OPS-04 |
| Jobs internes app | non relancés / non forcés | OK |

**Aucune synchronisation Google ni génération n’a été déclenchée sur client-01.**

---

## 8. Instance principale

| Élément | Valeur |
|---------|--------|
| Conteneur | `naxialis-agent-app-1` |
| Image | `naxialis-agent:v7.8.1` |
| Started | `2026-11-16T22:26:48Z` — **inchangé** |
| HTTPS login | 200 |

---

## 9. Risques résiduels

1. **Rollback V7.8.3** après réouverture = perte des écritures post-`2026-11-28T11:45:48Z` (et toute donnée créée après la sauvegarde OPS-02 `11:34Z`). Rollback = **restauration complète** uniquement.  
2. **BACKUP-001 ops** encore ouvert : pas de timer/rétention/copie externe/alertes pour client-01.  
3. **Cron Google existant** ne couvre que `agent.naxialis.com` — pas de sync planifiée client-01 (à traiter explicitement plus tard si souhaité, hors OPS-03).  
4. **Recette UI authentifiée** dépend de validation humaine (§10).  
5. Identifiant technique `ws_wordpress_naxialis` conserve la racine « naxialis » (voulu) — libellés/URLs métier sont client.

---

## 10. Checklist utilisateur (post-login)

À valider manuellement sur https://agent-client-01.naxialis.com/ :

- [ ] Connexion admin OK  
- [ ] Déconnexion OK  
- [ ] Dashboard + sélecteur : **Permis d'exploitation** / Webflow (non configuré)  
- [ ] Historique : 3 articles listés  
- [ ] Détail article : contenu/HTML lisible · liens cohérents  
- [ ] 3 images affichées  
- [ ] Inventaire WordPress (42)  
- [ ] Topics / veille / opportunités  
- [ ] Analytics (GSC/GA4) sans erreur bloquante  
- [ ] Usage / consommation (historique coûts si affiché)  
- [ ] Paramètres / intégrations : WP + Google client · Webflow vide  
- [ ] Aucune URL métier effective `naxialis.com` dans l’UI workspace  

---

## 11. Conditions restantes pour OPS-04 (BACKUP-001 ops)

Ne **pas** activer de stockage externe ni transférer de données client sans GO dédié.

| # | Élément | État actuel client-01 |
|---|---------|------------------------|
| 1 | Timer sauvegarde (systemd/cron) | **Absent** |
| 2 | Rétention (ex. 7/4/3) | Non configurée ops (scripts repo existent) |
| 3 | Copie externe chiffrée hors VPS | **Non** |
| 4 | Conservation sécurisée des clés | `.env` local 600 · pas de coffre ops documenté ici |
| 5 | Monitoring sauvegarde | **Non** |
| 6 | Alertes échec backup | **Non** |
| 7 | Tests périodiques de restauration | Répétitions OPS-01B faites · **pas** de cadence ops |

Sauvegardes manuelles disponibles : OPS-01B + **OPS-02** (`ops02-pre-v7163-20261128T113434Z`, SHA OK) + historiques v782/v783.

Références : `docs/operations/BACKUP.md`, `docs/audits/REMEDIATION_V7.16.3.md` § BACKUP-001.

---

## 12. Contraintes respectées

| Contrainte | OK |
|------------|----|
| Pas de touch `agent.naxialis.com` / autres apps | ✓ |
| Pas d’appel OpenAI payant | ✓ |
| Pas de sync externe / écriture CMS / Google / publication | ✓ |
| Pas de modif agents OpenAI | ✓ |
| Pas de suppression de sauvegarde | ✓ |
| Pas de migration supplémentaire | ✓ |
| Pas de commit / push | ✓ |
| OPS-04 non commencé | ✓ |

**Prochaine étape :** validation utilisateur de ce rapport (+ checklist §10) avant toute autorisation **OPS-04**.
