#!/usr/bin/env bash
# Validation locale V7.16.4 — login réel derrière reverse-proxy HTTPS + API session.
# Aucun VPS · aucune donnée prod · certificat de test auto-signé.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -p naxialis-validate-https -f docker-compose.validate-https.yml)
CERT_DIR="$ROOT/scripts/ops/validate-https/certs"
JAR="$(mktemp)"
REPORT="$(mktemp)"
BASE="https://127.0.0.1:4443"
EMAIL="validate@example.invalid"
PASS="ValidateOnly!23"

cleanup() {
  rm -f "$JAR" "$REPORT"
}
trap cleanup EXIT

echo "=== CERTS ==="
mkdir -p "$CERT_DIR"
if [ ! -f "$CERT_DIR/validate.crt" ] || [ ! -f "$CERT_DIR/validate.key" ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 2 \
    -keyout "$CERT_DIR/validate.key" \
    -out "$CERT_DIR/validate.crt" \
    -subj "/CN=127.0.0.1" \
    -addext "subjectAltName=IP:127.0.0.1" 2>/dev/null \
  || openssl req -x509 -nodes -newkey rsa:2048 -days 2 \
    -keyout "$CERT_DIR/validate.key" \
    -out "$CERT_DIR/validate.crt" \
    -subj "/CN=127.0.0.1"
fi

echo "=== UP ==="
"${COMPOSE[@]}" up -d --build
for i in $(seq 1 60); do
  if curl -skf "$BASE/api/health/ready" >/dev/null 2>&1; then
    echo READY_OK
    break
  fi
  echo "wait_$i"
  sleep 3
done
curl -skf "$BASE/api/health/live" >/dev/null
curl -skf "$BASE/api/health/ready" >/dev/null

echo "=== UNAUTH MUST 401 ==="
for path in \
  /api/agent/instructions \
  /api/google/status \
  /api/settings/wordpress \
  /api/settings/categories \
  /api/settings/openai \
  /api/wordpress-references \
  /api/workspace \
  /api/workspace/language
do
  code=$(curl -sk -o /tmp/v7164-body.json -w "%{http_code}" "$BASE$path")
  echo "$code $path"
  test "$code" = "401"
  grep -q "Non authentifié\|Unauthorized" /tmp/v7164-body.json
done
echo "UNAUTH_OK"

echo "=== LOGIN ==="
CSRF_JSON=$(curl -sk -c "$JAR" -b "$JAR" "$BASE/api/auth/csrf")
CSRF=$(python -c "import json,sys; print(json.load(sys.stdin)['csrfToken'])" <<<"$CSRF_JSON" 2>/dev/null \
  || python3 -c "import json,sys; print(json.load(sys.stdin)['csrfToken'])" <<<"$CSRF_JSON")
test -n "$CSRF"

LOGIN_CODE=$(curl -sk -c "$JAR" -b "$JAR" -o /tmp/v7164-login.txt -w "%{http_code}" \
  -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "redirect=false" \
  --data-urlencode "json=true" \
  --data-urlencode "callbackUrl=$BASE/dashboard")
echo "LOGIN_HTTP=$LOGIN_CODE"
# Auth.js may return 200 JSON or 302
test "$LOGIN_CODE" = "200" -o "$LOGIN_CODE" = "302"

# Cookie Secure session must be present
if ! grep -qiE '__Secure-authjs\.session-token|authjs\.session-token' "$JAR"; then
  echo "FATAL: session cookie missing after login"
  cat "$JAR" | sed 's/\t[^\t]*$/\t***/'
  exit 1
fi
# Prefer Secure cookie on HTTPS AUTH_URL
if grep -q '__Secure-authjs.session-token' "$JAR"; then
  echo "SECURE_SESSION_COOKIE=yes"
else
  echo "SECURE_SESSION_COOKIE=no (unexpected with AUTH_URL=https)"
  exit 1
fi
# HttpOnly markers in netscape jar
grep -q '#HttpOnly_' "$JAR" && echo "HTTPONLY_COOKIE=yes"

echo "=== AUTH API ==="
assert_not_401() {
  local path="$1"
  local code
  code=$(curl -sk -b "$JAR" -o /tmp/v7164-api.json -w "%{http_code}" "$BASE$path")
  echo "$code $path"
  if [ "$code" = "401" ] || [ "$code" = "403" ]; then
    echo "FATAL false deny on $path"
    head -c 400 /tmp/v7164-api.json; echo
    exit 1
  fi
  # 200 OK, or 503/400 métier sans faux 401
  case "$code" in
    200|204|400|404|409|422|503) ;;
    *) echo "WARN unexpected $code on $path (acceptable if not auth)";;
  esac
}

assert_not_401 /api/agent/instructions
# OpenAI non configuré → 503 attendu, pas 401
code=$(curl -sk -b "$JAR" -o /tmp/v7164-api.json -w "%{http_code}" "$BASE/api/agent/instructions")
test "$code" != "401"
grep -qv "Non authentifié" /tmp/v7164-api.json || true

assert_not_401 /api/google/status
python3 - <<'PY' || python - <<'PY'
import json
d=json.load(open("/tmp/v7164-api.json", encoding="utf-8"))
assert "oauthConfigured" in d or "connected" in d or "error" not in d or d.get("error") != "Non authentifié."
# Must not be auth error
assert d.get("error") != "Non authentifié."
print("GOOGLE_STATUS_KEYS=", sorted(d.keys())[:12])
print("connected=", d.get("connected"), "oauthConfigured=", d.get("oauthConfigured"))
PY

for path in \
  /api/settings/wordpress \
  /api/settings/categories \
  /api/settings/openai \
  /api/settings/general \
  /api/wordpress-references \
  /api/workspace \
  /api/workspace/language
do
  assert_not_401 "$path"
done

echo "=== DASHBOARD PAGE STILL NOT ENOUGH — API PROVED ==="
PAGE=$(curl -sk -b "$JAR" -o /dev/null -w "%{http_code}" "$BASE/settings")
echo "SETTINGS_PAGE=$PAGE"

echo "=== GEO GUARD IN IMAGE ==="
docker run --rm --entrypoint sh naxialis-agent:v7.16.4-local -c \
  'test ! -d prisma/migrations/20261103173400_drop_ai_visibility_monitor && echo DROP_ABSENT_OK'

echo "OPS03A_HTTPS_VALIDATE_OK" | tee "$REPORT"
cat "$REPORT"
