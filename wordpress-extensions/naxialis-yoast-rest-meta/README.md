# Naxialis Yoast REST Meta

Extension WordPress minimale pour permettre à Naxialis Content Agent d’écrire les métadonnées Yoast SEO via l’API REST native (`/wp/v2/posts`), car l’API REST dédiée de Yoast est **en lecture seule**.

## Champs exposés

| Meta key | Usage |
|---|---|
| `_yoast_wpseo_title` | Titre SEO |
| `_yoast_wpseo_metadesc` | Meta description |

## Installation (environnement de test d’abord)

1. Copier le dossier `naxialis-yoast-rest-meta` dans `wp-content/plugins/`.
2. Activer **Yoast SEO**.
3. Activer **Naxialis Yoast REST Meta**.
4. Dans Naxialis → Paramètres → Intégration SEO WordPress → choisir **Yoast SEO** → Enregistrer.
5. Générer un article (brouillon uniquement).
6. Ouvrir le brouillon dans wp-admin et vérifier le panneau Yoast (titre + meta description).

## Validation manuelle recommandée

```bash
# Après création d’un brouillon (ID = POST_ID), avec Application Password :
curl -u "USER:APP_PASSWORD" \
  "https://VOTRE-SITE/wp-json/wp/v2/posts/POST_ID?context=edit" \
  | jq '.meta._yoast_wpseo_title, .meta._yoast_wpseo_metadesc'
```

Un HTTP 200 sur le POST ne suffit pas : les valeurs doivent apparaître dans `meta` en `context=edit` et dans l’éditeur Yoast.

## Sécurité

- Permissions : `edit_post` sur le post concerné.
- Pas de route REST publique dédiée.
- Pas de publication automatique.
- Ne modifie pas les articles déjà publiés côté Naxialis (statut forcé `draft`).

## Désinstallation

Désactiver puis supprimer le plugin. Les métadonnées déjà écrites restent dans `wp_postmeta` (comportement WordPress standard).
