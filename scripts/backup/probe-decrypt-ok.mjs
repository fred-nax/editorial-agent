/**
 * Vérifie que APP_SETTINGS_ENCRYPTION_KEY déchiffre les secrets AppSettings
 * sans jamais afficher le clair. À exécuter avec la clé en env (non loguée).
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";

const CONTAINER = process.env.POSTGRES_CONTAINER || "naxialis-upgrade-postgres-1";
const PGUSER = process.env.PGUSER || "upgrade";
const PGDB = process.env.PGDB || "naxialis_agent_upgrade";
const keyRaw = process.env.APP_SETTINGS_ENCRYPTION_KEY?.trim();

function die(m) {
  console.error("[decrypt-probe]", m);
  process.exit(1);
}

if (!keyRaw) die("APP_SETTINGS_ENCRYPTION_KEY manquante");
if (PGDB === "naxialis_agent") die("refus naxialis_agent");

function resolveKey() {
  try {
    const asB64 = Buffer.from(keyRaw, "base64");
    if (asB64.length === 32) return asB64;
  } catch {
    /* fall through */
  }
  return createHash("sha256").update(keyRaw, "utf8").digest();
}

function tryDecrypt(payload) {
  if (!payload?.trim()) return { present: false, ok: null };
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return { present: true, ok: false, reason: "format" };
  }
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      resolveKey(),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return { present: true, ok: plain.length > 0, bytes: plain.length };
  } catch {
    return { present: true, ok: false, reason: "decrypt_failed" };
  }
}

const row = execFileSync(
  "docker",
  [
    "exec",
    CONTAINER,
    "psql",
    "-U",
    PGUSER,
    "-d",
    PGDB,
    "-Atc",
    `SELECT json_build_object(
      'openai', "openaiApiKeyEncrypted",
      'wp', "wpAppPasswordEncrypted",
      'webflow', "webflowApiTokenEncrypted"
    ) FROM "AppSettings" WHERE id='default';`,
  ],
  { encoding: "utf8" }
).trim();

const parsed = JSON.parse(row);
const result = {
  openai: tryDecrypt(parsed.openai),
  wp: tryDecrypt(parsed.wp),
  webflow: tryDecrypt(parsed.webflow),
};
// Strip lengths that could hint at secret size in reports? length ok as metadata.
console.log(JSON.stringify({ database: PGDB, decrypt: result }, null, 2));
const failed = Object.values(result).filter((r) => r.present && r.ok === false);
if (failed.length) process.exit(2);
