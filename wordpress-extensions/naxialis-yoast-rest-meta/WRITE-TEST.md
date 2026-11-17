# Procédure — test d’écriture Yoast (brouillon uniquement)

À exécuter **manuellement** après un diagnostic Paramètres « Compatible ».
Naxialis Content Agent **ne lance pas** ce test automatiquement.

## Prérequis

1. Plugin SEO = `yoast_seo` dans Paramètres.
2. Diagnostic « Vérifier la connexion SEO » = Compatible.
3. Yoast SEO + Naxialis Yoast REST Meta actifs.
4. Un brouillon WordPress de test déjà créé (statut `draft`), ID connu.
5. Compte Application Password capable d’éditer ce brouillon.

## Étapes

1. Noter les valeurs SEO actuelles du brouillon (`context=edit`) pour restauration :

```bash
curl -u "USER:APP_PASSWORD" \
  "https://VOTRE-SITE/wp-json/wp/v2/posts/POST_ID?context=edit" \
  | jq '{status, meta: {title: .meta._yoast_wpseo_title, desc: .meta._yoast_wpseo_metadesc}}'
```

2. Vérifier `status == "draft"`. **Ne pas** continuer si publié.

3. Écrire des valeurs de test (contenu article inchangé) :

```bash
curl -u "USER:APP_PASSWORD" -X POST \
  -H "Content-Type: application/json" \
  "https://VOTRE-SITE/wp-json/wp/v2/posts/POST_ID" \
  -d '{
    "meta": {
      "_yoast_wpseo_title": "NAXIALIS_TEST_TITLE",
      "_yoast_wpseo_metadesc": "NAXIALIS_TEST_DESC"
    }
  }'
```

4. Relire en `context=edit` et comparer titre / description.

5. Ouvrir le brouillon dans wp-admin → panneau Yoast.

6. Restaurer les valeurs SEO initiales avec le même POST `meta`.

## Interdits

- Ne pas créer d’article depuis le diagnostic Paramètres.
- Ne pas modifier un article publié.
- Ne pas supprimer le brouillon.
- Ne pas considérer un HTTP 200 seul comme preuve (relire `meta`).
