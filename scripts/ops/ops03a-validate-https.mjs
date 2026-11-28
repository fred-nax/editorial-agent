/**
 * Validation locale V7.16.4 — login réel derrière reverse-proxy HTTPS.
 * Windows / Node — équivalent de ops03a-validate-https.sh
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://127.0.0.1:4443";
const EMAIL = "validate@example.invalid";
const PASS = "ValidateOnly!23";
const jarDir = mkdtempSync(path.join(tmpdir(), "v7164-"));
const jar = path.join(jarDir, "cookies.txt");

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    ...opts,
  });
  if (r.status !== 0 && opts.allowFail !== true) {
    console.error(r.stdout || "");
    console.error(r.stderr || "");
    throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}`);
  }
  return r;
}

function curl(args) {
  return sh("curl", ["-sk", ...args], { allowFail: true });
}

function compose(args) {
  return sh("docker", ["compose", "-p", "naxialis-validate-https", "-f", "docker-compose.validate-https.yml", ...args]);
}

console.log("=== UP ===");
compose(["up", "-d"]);

let ready = false;
for (let i = 1; i <= 60; i++) {
  const r = curl(["-f", `${BASE}/api/health/ready`]);
  if (r.status === 0) {
    ready = true;
    console.log("READY_OK");
    break;
  }
  console.log(`wait_${i}`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
}
if (!ready) throw new Error("ready timeout");

console.log("=== UNAUTH MUST 401 ===");
const unauthPaths = [
  "/api/agent/instructions",
  "/api/google/status",
  "/api/settings/wordpress",
  "/api/settings/categories",
  "/api/settings/openai",
  "/api/wordpress-references",
  "/api/workspace",
  "/api/workspace/language",
];
for (const p of unauthPaths) {
  const bodyFile = path.join(jarDir, "body.json");
  const r = curl(["-o", bodyFile, "-w", "%{http_code}", `${BASE}${p}`]);
  const code = (r.stdout || "").trim();
  const body = readFileSync(bodyFile, "utf8");
  console.log(`${code} ${p}`);
  if (code !== "401") throw new Error(`expected 401 for ${p}, got ${code}`);
  if (!/Non authentifié|Unauthorized/i.test(body)) {
    throw new Error(`unexpected body for ${p}: ${body}`);
  }
}
console.log("UNAUTH_OK");

console.log("=== LOGIN ===");
const csrfRes = curl(["-c", jar, "-b", jar, `${BASE}/api/auth/csrf`]);
const csrfJson = JSON.parse(csrfRes.stdout || "{}");
const csrf = csrfJson.csrfToken;
if (!csrf) throw new Error("csrf missing");

const loginBody = new URLSearchParams({
  csrfToken: csrf,
  email: EMAIL,
  password: PASS,
  redirect: "false",
  json: "true",
  callbackUrl: `${BASE}/dashboard`,
}).toString();

const loginOut = path.join(jarDir, "login.txt");
const login = curl([
  "-c", jar, "-b", jar,
  "-o", loginOut,
  "-w", "%{http_code}",
  "-X", "POST",
  `${BASE}/api/auth/callback/credentials`,
  "-H", "Content-Type: application/x-www-form-urlencoded",
  "--data", loginBody,
]);
const loginCode = (login.stdout || "").trim();
console.log(`LOGIN_HTTP=${loginCode}`);
if (!["200", "302"].includes(loginCode)) {
  console.error(readFileSync(loginOut, "utf8"));
  throw new Error(`login failed: ${loginCode}`);
}

const jarText = readFileSync(jar, "utf8");
if (!/__Secure-authjs\.session-token/.test(jarText)) {
  console.error(jarText.replace(/\t[^\t]+$/gm, "\t***"));
  throw new Error("SECURE session cookie missing");
}
console.log("SECURE_SESSION_COOKIE=yes");
if (/#HttpOnly_/.test(jarText)) console.log("HTTPONLY_COOKIE=yes");

function assertNot401(apiPath) {
  const bodyFile = path.join(jarDir, "api.json");
  const r = curl(["-b", jar, "-o", bodyFile, "-w", "%{http_code}", `${BASE}${apiPath}`]);
  const code = (r.stdout || "").trim();
  const body = readFileSync(bodyFile, "utf8");
  console.log(`${code} ${apiPath}`);
  if (code === "401" || code === "403") {
    console.error(body);
    throw new Error(`false deny on ${apiPath}`);
  }
  if (/Non authentifié/.test(body)) {
    throw new Error(`auth error body on ${apiPath}: ${body}`);
  }
  return { code, body };
}

console.log("=== AUTH API ===");
assertNot401("/api/agent/instructions");
const g = assertNot401("/api/google/status");
const gJson = JSON.parse(g.body);
console.log(
  `GOOGLE status connected=${gJson.connected} oauthConfigured=${gJson.oauthConfigured}`
);
if (gJson.error === "Non authentifié.") throw new Error("google status auth fail");

for (const p of [
  "/api/settings/wordpress",
  "/api/settings/categories",
  "/api/settings/openai",
  "/api/settings/general",
  "/api/wordpress-references",
  "/api/workspace",
  "/api/workspace/language",
]) {
  assertNot401(p);
}

const settingsPage = curl(["-b", jar, "-o", path.join(jarDir, "settings.html"), "-w", "%{http_code}", `${BASE}/settings`]);
console.log(`SETTINGS_PAGE=${(settingsPage.stdout || "").trim()}`);

const geo = sh("docker", [
  "run",
  "--rm",
  "--entrypoint",
  "sh",
  "naxialis-agent:v7.16.4-local",
  "-c",
  "test ! -d prisma/migrations/20261103173400_drop_ai_visibility_monitor && echo DROP_ABSENT_OK",
]);
console.log((geo.stdout || "").trim());

writeFileSync(path.join(jarDir, "ok.txt"), "OPS03A_HTTPS_VALIDATE_OK\n");
console.log("OPS03A_HTTPS_VALIDATE_OK");
rmSync(jarDir, { recursive: true, force: true });
