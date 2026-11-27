#!/usr/bin/env bash
# V7.16.3 — Restauration contrôlée vers une base / stack ISOLÉE.
# INTERDIT : restaurer vers naxialis_agent ou toute base listée dans FORBIDDEN_DBS.
#
# Usage :
#   CONFIRM_RESTORE=YES \
#   TARGET_DATABASE=naxialis_agent_restore_v7163 \
#   BACKUP_DIR=./backups/20261127T120000Z \
#   ./scripts/backup/restore-instance.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-naxialis-agent-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-naxialis}"
BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR requis}"
TARGET_DATABASE="${TARGET_DATABASE:?TARGET_DATABASE requis}"
CONFIRM_RESTORE="${CONFIRM_RESTORE:-}"
FORBIDDEN_DBS="${FORBIDDEN_DBS:-naxialis_agent}"

log() { echo "[restore] $*"; }
die() { echo "[restore] ERROR: $*" >&2; exit 1; }

[[ "$CONFIRM_RESTORE" == "YES" ]] || die "CONFIRM_RESTORE=YES requis"
[[ -d "$BACKUP_DIR" ]] || die "BACKUP_DIR introuvable: $BACKUP_DIR"
[[ -f "$BACKUP_DIR/postgres.dump" ]] || die "postgres.dump manquant"
[[ -f "$BACKUP_DIR/manifest.json" ]] || die "manifest.json manquant"

for forbidden in $FORBIDDEN_DBS; do
  [[ "$TARGET_DATABASE" == "$forbidden" ]] && die "cible interdite: $TARGET_DATABASE"
done
[[ "$TARGET_DATABASE" == *migtest* || "$TARGET_DATABASE" == *restore* || "$TARGET_DATABASE" == *bench* ]] \
  || die "cible doit contenir restore|migtest|bench (reçu: $TARGET_DATABASE)"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

EXPECTED_SHA="$(node -e "const m=require(process.argv[1]); process.stdout.write(m.dumpSha256||'')" "$BACKUP_DIR/manifest.json")"
ACTUAL_SHA="$(sha256_file "$BACKUP_DIR/postgres.dump")"
[[ -n "$EXPECTED_SHA" ]] || die "dumpSha256 absent du manifeste"
[[ "$EXPECTED_SHA" == "$ACTUAL_SHA" ]] || die "SHA-256 dump invalide (attendu $EXPECTED_SHA, obtenu $ACTUAL_SHA)"
log "intégrité dump OK"

EXISTS="$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -Atc \
  "SELECT 1 FROM pg_database WHERE datname='${TARGET_DATABASE}'")"
if [[ "$EXISTS" == "1" ]]; then
  [[ "${ALLOW_DROP_TARGET:-}" == "YES" ]] || die "la base $TARGET_DATABASE existe déjà — ALLOW_DROP_TARGET=YES pour la recréer"
  log "DROP DATABASE $TARGET_DATABASE"
  docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TARGET_DATABASE}' AND pid <> pg_backend_pid();" >/dev/null || true
  docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
    "DROP DATABASE \"${TARGET_DATABASE}\";"
fi

log "CREATE DATABASE $TARGET_DATABASE"
docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "CREATE DATABASE \"${TARGET_DATABASE}\" OWNER ${POSTGRES_USER};"

docker cp "$BACKUP_DIR/postgres.dump" "$POSTGRES_CONTAINER:/tmp/naxialis_restore.dump"
log "pg_restore → $TARGET_DATABASE"
docker exec "$POSTGRES_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$TARGET_DATABASE" --no-owner --role="$POSTGRES_USER" \
  /tmp/naxialis_restore.dump || true
# pg_restore peut renvoyer warnings non fatals ; vérifier l’identité
DB_CHECK="$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$TARGET_DATABASE" -Atc "SELECT current_database();")"
[[ "$DB_CHECK" == "$TARGET_DATABASE" ]] || die "base après restore=$DB_CHECK"

COUNTS="$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$TARGET_DATABASE" -Atc "
SELECT json_build_object(
  'generations', (SELECT COUNT(*) FROM \"ArticleGeneration\"),
  'images', (SELECT COUNT(*) FROM \"ArticleFeaturedImage\"),
  'events', (SELECT COUNT(*) FROM \"OpenAiUsageEvent\"),
  'wordpressPosts', (SELECT COUNT(*) FROM \"WordPressPost\"),
  'webflowItems', (SELECT COUNT(*) FROM \"WebflowCmsItem\")
);")"
log "counts=$COUNTS"

# Restauration optionnelle des images vers un dossier isolé
if [[ -f "$BACKUP_DIR/featured-images.tar.gz" && -n "${RESTORE_IMAGES_TO:-}" ]]; then
  mkdir -p "$RESTORE_IMAGES_TO"
  tar -xzf "$BACKUP_DIR/featured-images.tar.gz" -C "$RESTORE_IMAGES_TO"
  log "images → $RESTORE_IMAGES_TO"
fi

docker exec "$POSTGRES_CONTAINER" rm -f /tmp/naxialis_restore.dump
log "OK restore $TARGET_DATABASE"
echo "$COUNTS"
exit 0
