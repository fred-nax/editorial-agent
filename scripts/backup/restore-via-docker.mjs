/**
 * V7.16.3 — Restauration isolée via docker.
 * CONFIRM_RESTORE=YES + TARGET_DATABASE contenant restore|migtest|bench.
 * Interdit naxialis_agent.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CONTAINER = process.env.POSTGRES_CONTAINER || "naxialis-agent-postgres-1";
const PGUSER = process.env.POSTGRES_USER || "naxialis";
const BACKUP_DIR = process.env.BACKUP_DIR;
const TARGET = process.env.TARGET_DATABASE;
const CONFIRM = process.env.CONFIRM_RESTORE;
const ALLOW_DROP = process.env.ALLOW_DROP_TARGET === "YES";
const FORBIDDEN = (process.env.FORBIDDEN_DBS || "naxialis_agent")
  .split(/[\s,]+/)
  .filter(Boolean);

function die(msg) {
  console.error("[restore]", msg);
  process.exit(1);
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

if (CONFIRM !== "YES") die("CONFIRM_RESTORE=YES requis");
if (!BACKUP_DIR || !existsSync(BACKUP_DIR)) die("BACKUP_DIR invalide");
if (!TARGET) die("TARGET_DATABASE requis");
if (FORBIDDEN.includes(TARGET)) die(`cible interdite: ${TARGET}`);
if (!/(restore|migtest|bench)/i.test(TARGET)) {
  die("TARGET_DATABASE doit contenir restore|migtest|bench");
}

const dumpPath = path.join(BACKUP_DIR, "postgres.dump");
const manifestPath = path.join(BACKUP_DIR, "manifest.json");
if (!existsSync(dumpPath) || !existsSync(manifestPath)) {
  die("postgres.dump ou manifest.json manquant");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const actualSha = createHash("sha256")
  .update(readFileSync(dumpPath))
  .digest("hex");
if (!manifest.dumpSha256 || manifest.dumpSha256 !== actualSha) {
  die(
    `SHA-256 invalide (attendu ${manifest.dumpSha256}, obtenu ${actualSha})`
  );
}
console.log("[restore] intégrité dump OK");

const exists = sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  "postgres",
  "-Atc",
  `SELECT 1 FROM pg_database WHERE datname='${TARGET.replace(/'/g, "''")}'`,
]);
if (exists === "1") {
  if (!ALLOW_DROP) die(`base ${TARGET} existe — ALLOW_DROP_TARGET=YES`);
  console.log("[restore] DROP", TARGET);
  try {
    sh("docker", [
      "exec",
      CONTAINER,
      "psql",
      "-U",
      PGUSER,
      "-d",
      "postgres",
      "-c",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TARGET.replace(/'/g, "''")}' AND pid <> pg_backend_pid();`,
    ]);
  } catch {
    /* ignore */
  }
  sh("docker", [
    "exec",
    CONTAINER,
    "psql",
    "-U",
    PGUSER,
    "-d",
    "postgres",
    "-c",
    `DROP DATABASE "${TARGET.replace(/"/g, "")}";`,
  ]);
}

console.log("[restore] CREATE", TARGET);
sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  "postgres",
  "-c",
  `CREATE DATABASE "${TARGET.replace(/"/g, "")}" OWNER ${PGUSER};`,
]);

execFileSync("docker", [
  "cp",
  dumpPath,
  `${CONTAINER}:/tmp/naxialis_restore.dump`,
]);
try {
  execFileSync(
    "docker",
    [
      "exec",
      CONTAINER,
      "pg_restore",
      "-U",
      PGUSER,
      "-d",
      TARGET,
      "--no-owner",
      `--role=${PGUSER}`,
      "/tmp/naxialis_restore.dump",
    ],
    { stdio: "inherit" }
  );
} catch {
  // pg_restore exit != 0 possible avec warnings
  console.warn("[restore] pg_restore a signalé des warnings — vérification suite");
}

const dbCheck = sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  TARGET,
  "-Atc",
  "SELECT current_database();",
]);
if (dbCheck !== TARGET) die(`base après restore=${dbCheck}`);

const counts = sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  TARGET,
  "-Atc",
  `SELECT json_build_object(
    'generations', (SELECT COUNT(*) FROM "ArticleGeneration"),
    'images', (SELECT COUNT(*) FROM "ArticleFeaturedImage"),
    'events', (SELECT COUNT(*) FROM "OpenAiUsageEvent"),
    'wordpressPosts', (SELECT COUNT(*) FROM "WordPressPost"),
    'webflowItems', (SELECT COUNT(*) FROM "WebflowCmsItem")
  );`,
]);

sh("docker", ["exec", CONTAINER, "rm", "-f", "/tmp/naxialis_restore.dump"]);
console.log("[restore] OK", TARGET);
console.log(counts);

const expected = manifest.counts;
const actual = JSON.parse(counts);
if (expected) {
  for (const key of Object.keys(expected)) {
    if (Number(actual[key]) !== Number(expected[key])) {
      console.warn(
        `[restore] WARN compteur ${key}: attendu ${expected[key]}, obtenu ${actual[key]}`
      );
    }
  }
}
