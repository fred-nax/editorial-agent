# Images à la une — V7.0

## Stockage

Les fichiers WebP sont stockés hors PostgreSQL, dans un volume Docker dédié :

- Conteneur : `/app/storage/featured-images`
- Volume Compose : `featured_images_data`
- Variable : `FEATURED_IMAGE_STORAGE_DIR`

Les métadonnées (prompt, style, ALT, `wpMediaId`, statut) restent en base via `ArticleFeaturedImage`.

L’accès aux binaires passe uniquement par la route authentifiée :

`GET /api/articles/[id]/featured-image/file?imageId=…`

Aucun listing public du répertoire n’est exposé. Les chemins sont validés contre le path traversal.

## Sauvegardes

Inclure le volume `featured_images_data` dans les sauvegardes VPS au même rythme que `postgres_data`.

Exemple (hôte Docker) :

```bash
docker run --rm \
  -v naxialis-agent_featured_images_data:/data:ro \
  -v /var/backups/naxialis:/backup \
  alpine tar czf /backup/featured-images-$(date +%F).tar.gz -C /data .
```

Après restauration PostgreSQL, restaurer aussi ce volume pour éviter des métadonnées orphelines.

## Migration

Migration additive uniquement :

`prisma/migrations/20261111140000_article_featured_image/`

Ne pas exécuter manuellement de migration destructive sur le VPS. Le démarrage Docker applique `prisma migrate deploy` via `scripts/docker-start.mjs`.

## Modèles OpenAI

- Image : `OPENAI_IMAGE_MODEL` (défaut `gpt-image-2.5-flare`)
- ALT vision : `OPENAI_VISION_MODEL` (défaut `gpt-4.1-mini`)

Les coûts image ne sont pas mélangés aux KPI LLM des articles.
