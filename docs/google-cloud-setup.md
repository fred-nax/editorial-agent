# Configuration Google Cloud — Search Console & GA4

Intégration **mono-site** pour Naxialis Content Agent. Indépendante de l’authentification administrateur Auth.js et du moteur éditorial OpenAI.

## 1. Projet Google Cloud

1. Ouvrir [Google Cloud Console](https://console.cloud.google.com/).
2. Créer (ou sélectionner) un projet dédié à l’agent.
3. Activer les API :
   - **Google Search Console API**
   - **Google Analytics Data API**
   - **Google Analytics Admin API**
4. Écran de consentement OAuth :
   - Type **External** (ou Internal si Workspace).
   - Scopes en lecture seule :
     - `openid`
     - `email`
     - `https://www.googleapis.com/auth/webmasters.readonly`
     - `https://www.googleapis.com/auth/analytics.readonly`
   - Publier l’appli ou ajouter les comptes de test.

## 2. Identifiants OAuth

1. Créer des identifiants **OAuth 2.0 Client ID** (application Web).
2. URI de redirection autorisée :

```text
https://VOTRE_DOMAINE_AGENT/api/google/oauth/callback
```

En local (exemple) :

```text
http://localhost:3000/api/google/oauth/callback
```

3. Copier `Client ID` et `Client secret`.

## 3. Variables d’environnement

Dans `.env` (jamais dans le navigateur ni dans l’image commitée) :

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
GOOGLE_SYNC_CRON_SECRET=$(openssl rand -hex 32)
AUTH_URL=https://VOTRE_DOMAINE_AGENT
```

`AUTH_URL` sert aussi à construire l’URI de callback.

## 4. Connexion dans l’agent

1. Se connecter en administrateur.
2. Ouvrir **Paramètres** → **Google Search Console & Analytics**.
3. **Connecter Google** (consentement, refresh token via `prompt=consent`).
4. Sélectionner la propriété Search Console et la propriété GA4 du site WordPress.
5. Lancer **Import 90 jours**, puis **Synchroniser maintenant** au besoin.

## 5. Cron VPS quotidien

Sans Redis/BullMQ. Exemple crontab (05:15 Europe/Paris) :

```bash
15 5 * * * curl -fsS -X POST \
  -H "Authorization: Bearer $GOOGLE_SYNC_CRON_SECRET" \
  https://VOTRE_DOMAINE_AGENT/api/google/sync/cron
```

Le endpoint :

- vérifie le Bearer ;
- refuse les runs concurrents ;
- lance une sync `daily` (rafraîchit les 7 derniers jours) via le même enqueue que le bouton manuel.

## 6. Migration Prisma

```bash
npx prisma migrate deploy
# ou en local :
npx prisma migrate dev
```

Migration additive : `20261115170000_google_integrations_v761`.

## 7. Limites API connues

- **AI Overviews / AI Mode** : visibles dans l’UI Search Console, **non exposés** par `searchanalytics.query` → non intégrés (pas d’invention).
- Trafic assistants IA : classification GA4 via `sessionSource` / `sessionMedium` et référents connus uniquement.
- Les brouillons WordPress (`?p=`) ne sont pas traités comme pages publiques.

## 8. Déploiement Docker

1. Ajouter les variables Google dans `.env` du VPS.
2. Rebuild / recreate du conteneur app (pas de `docker compose down -v`).
3. `prisma migrate deploy` au démarrage ou manuellement.
4. Configurer le cron.
5. Vérifier Paramètres → connexion Google.
