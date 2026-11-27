/**
 * Charge un dump de backup + archive images dans la stack naxialis-upgrade.
 * Cible unique : naxialis_agent_upgrade (jamais naxialis_agent).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const CONTAINER = process.env.POSTGRES_CONTAINER || "naxialis-upgrade-postgres-1";
const PGUSER = "upgrade";
const TARGET = "naxialis_agent_upgrade";
const BACKUP_DIR =
  process.env.BACKUP_DIR ||
  path.join(process.cwd(), "backups", "20261127T105950Z");
const APP_CONTAINER = process.env.APP_CONTAINER || "";

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function die(msg) {
  console.error("[seed-upgrade]", msg);
  process.exit(1);
}

if (!existsSync(BACKUP_DIR)) die(`BACKUP_DIR manquant: ${BACKUP_DIR}`);
const dumpPath = path.join(BACKUP_DIR, "postgres.dump");
const manifestPath = path.join(BACKUP_DIR, "manifest.json");
const imgArchive = path.join(BACKUP_DIR, "featured-images.tar.gz");
if (!existsSync(dumpPath) || !existsSync(manifestPath)) die("dump/manifest manquants");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sha = createHash("sha256").update(readFileSync(dumpPath)).digest("hex");
if (sha !== manifest.dumpSha256) die("SHA-256 dump invalide");
console.log("[seed-upgrade] dump integrity OK");

const tmpDump = `/tmp/${TARGET}.dump`;
sh("docker", ["cp", dumpPath, `${CONTAINER}:${tmpDump}`]);

// Recréer la base cible dans le conteneur upgrade
sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  "postgres",
  "-c",
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TARGET}' AND pid <> pg_backend_pid();`,
]);
sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  "postgres",
  "-c",
  `DROP DATABASE IF EXISTS "${TARGET}";`,
]);
sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  "postgres",
  "-c",
  `CREATE DATABASE "${TARGET}" OWNER ${PGUSER};`,
]);

sh("docker", [
  "exec",
  CONTAINER,
  "pg_restore",
  "-U",
  PGUSER,
  "-d",
  TARGET,
  "--no-owner",
  "--no-acl",
  "--clean",
  "--if-exists",
  tmpDump,
]);

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
    'generations', (SELECT COUNT(*)::int FROM "ArticleGeneration"),
    'images', (SELECT COUNT(*)::int FROM "ArticleFeaturedImage"),
    'events', (SELECT COUNT(*)::int FROM "OpenAiUsageEvent"),
    'wordpressPosts', (SELECT COUNT(*)::int FROM "WordPressPost"),
    'webflowItems', (SELECT COUNT(*)::int FROM "WebflowCmsItem"),
    'workspaces', (SELECT COUNT(*)::int FROM "EditorialWorkspace"),
    'geoTables', (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Visibility%')
  );`,
]);
console.log("[seed-upgrade] counts", counts);

if (existsSync(imgArchive) && APP_CONTAINER) {
  const tmpTar = "/tmp/featured-images.tar.gz";
  sh("docker", ["cp", imgArchive, `${APP_CONTAINER}:${tmpTar}`]);
  sh("docker", [
    "exec",
    "-u",
    "0",
    APP_CONTAINER,
    "sh",
    "-c",
    "mkdir -p /app/storage/featured-images && tar -xzf /tmp/featured-images.tar.gz -C /app/storage/featured-images && chown -R nextjs:nodejs /app/storage/featured-images && find /app/storage/featured-images -type f | wc -l",
  ]);
  console.log("[seed-upgrade] featured images restored into app volume");
} else if (existsSync(imgArchive)) {
  console.log(
    "[seed-upgrade] archive images présente — lancer avec APP_CONTAINER pour injection volume"
  );
}

console.log("[seed-upgrade] OK");
