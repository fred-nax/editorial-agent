#!/bin/sh
set -eu

echo "=== docker network ls ==="
docker network ls

echo
echo "=== conteneurs nginx-proxy / letsencrypt ==="
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' | grep -Ei 'nginx|letsencrypt|acme|proxy' || true

echo
echo "=== réseaux attachés aux conteneurs proxy ==="
for id in $(docker ps -q); do
  image=$(docker inspect -f '{{.Config.Image}}' "$id")
  name=$(docker inspect -f '{{.Name}}' "$id" | sed 's#^/##')
  case "$image $name" in
    *nginx-proxy*|*nginxproxy*|*letsencrypt*|*acme-companion*)
      echo "--- $name ($image) ---"
      docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{println}}{{end}}' "$id"
      docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$id" | grep -E '^(DEFAULT_EMAIL|LETSENCRYPT_|NGINX_|VIRTUAL_)' || true
      ;;
  esac
done
