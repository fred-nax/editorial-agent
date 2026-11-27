#!/usr/bin/env bash
# V7.16.3 — Sauvegarde instance (PostgreSQL custom + fichiers + manifeste).
# Usage (hôte avec docker) :
#   ./scripts/backup/backup-instance.sh
# Variables :
#   BACKUP_ROOT (défaut: ./backups)
#   POSTGRES_CONTAINER (défaut: naxialis-agent-postgres-1)
#   POSTGRES_USER / POSTGRES_DB
#   DATABASE_NAME_GUARD — doit matcher le nom de base dumpée (défaut: naxialis_agent)
#   FEATURED_IMAGES_SRC — chemin hôte ou laisser vide pour volume docker cp
#   APP_VERSION — tag/commit (optionnel)
#   RETENTION_DAILY / WEEKLY / MONTHLY
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-naxialis-agent-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-naxialis}"
POSTGRES_DB="${POSTGRES_DB:-naxialis_agent}"
DATABASE_NAME_GUARD="${DATABASE_NAME_GUARD:-naxialis_agent}"
APP_VERSION="${APP_VERSION:-unknown}"
LOCK_FILE="${BACKUP_ROOT}/.backup.lock"
RETENTION_DAILY="${RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${RETENTION_WEEKLY:-4}"
RETENTION_MONTHLY="${RETENTION_MONTHLY:-3}"

log() { echo "[backup] $*"; }
die() { echo "[backup] ERROR: $*" >&2; exit 1; }

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT" 2>/dev/null || true

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "une sauvegarde est déjà en cours ($LOCK_FILE)"
else
  if [[ -f "$LOCK_FILE" ]]; then
    die "lock présent ($LOCK_FILE) — supprimer si orphelin"
  fi
  echo $$ >"$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"
chmod 700 "$DEST"

# Identité de la base
DB_ACTUAL="$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT current_database();")"
[[ "$DB_ACTUAL" == "$DATABASE_NAME_GUARD" ]] || die "base=$DB_ACTUAL refuse (attendu $DATABASE_NAME_GUARD)"

PG_VERSION="$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SHOW server_version;")"
DUMP_FILE="$DEST/postgres.dump"
log "dump $DB_ACTUAL → $DUMP_FILE"
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/naxialis_backup.dump
docker cp "$POSTGRES_CONTAINER:/tmp/naxialis_backup.dump" "$DUMP_FILE"
docker exec "$POSTGRES_CONTAINER" rm -f /tmp/naxialis_backup.dump
chmod 600 "$DUMP_FILE"

# Fichiers images (volume ou chemin)
IMAGES_ARCHIVE="$DEST/featured-images.tar.gz"
if [[ -n "${FEATURED_IMAGES_SRC:-}" && -d "$FEATURED_IMAGES_SRC" ]]; then
  tar -czf "$IMAGES_ARCHIVE" -C "$FEATURED_IMAGES_SRC" .
elif docker volume ls -q | grep -qx 'naxialis-agent_featured_images_data'; then
  docker run --rm -v naxialis-agent_featured_images_data:/data:ro -v "$DEST":/out alpine \
    tar -czf /out/featured-images.tar.gz -C /data .
else
  log "WARN: pas de volume/chemin featured-images — archive vide"
  tar -czf "$IMAGES_ARCHIVE" -T /dev/null 2>/dev/null || gzip -c /dev/null >"$IMAGES_ARCHIVE"
fi
chmod 600 "$IMAGES_ARCHIVE" 2>/dev/null || true

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

DUMP_SHA="$(sha256_file "$DUMP_FILE")"
IMG_SHA="$(sha256_file "$IMAGES_ARCHIVE")"

# Compteurs (lecture seule)
COUNTS="$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "
SELECT json_build_object(
  'generations', (SELECT COUNT(*) FROM \"ArticleGeneration\"),
  'images', (SELECT COUNT(*) FROM \"ArticleFeaturedImage\"),
  'events', (SELECT COUNT(*) FROM \"OpenAiUsageEvent\"),
  'wordpressPosts', (SELECT COUNT(*) FROM \"WordPressPost\"),
  'webflowItems', (SELECT COUNT(*) FROM \"WebflowCmsItem\")
);")"

MANIFEST="$DEST/manifest.json"
cat >"$MANIFEST" <<EOF
{
  "createdAt": "$STAMP",
  "appVersion": "$APP_VERSION",
  "database": "$DB_ACTUAL",
  "postgresVersion": "$PG_VERSION",
  "dumpFile": "postgres.dump",
  "dumpSha256": "$DUMP_SHA",
  "featuredImagesArchive": "featured-images.tar.gz",
  "featuredImagesSha256": "$IMG_SHA",
  "counts": $COUNTS,
  "notes": [
    "Secrets de déchiffrement (APP_SETTINGS_ENCRYPTION_KEY, AUTH_SECRET, Google) hors dump — sauvegarde séparée chiffrée.",
    "Une copie uniquement sur le même VPS ne protège pas contre la perte du serveur."
  ]
}
EOF
chmod 600 "$MANIFEST"

# Rétention simple (par préfixe date UTC)
prune_keep_newest() {
  local pattern="$1" keep="$2"
  mapfile -t dirs < <(ls -1d "$BACKUP_ROOT"/$pattern 2>/dev/null | sort -r || true)
  local i=0
  for d in "${dirs[@]:-}"; do
    i=$((i + 1))
    if [[ $i -gt $keep ]]; then
      log "prune $d"
      rm -rf "$d"
    fi
  done
}

# Quotidien = toutes les sauvegardes horodatées (garde les N plus récentes)
prune_keep_newest "20*" "$RETENTION_DAILY"

log "OK $DEST"
log "dumpSha256=$DUMP_SHA"
exit 0
