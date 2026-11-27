/**
 * V7.16.3 — Sauvegarde via docker exec (Windows / CI compatible).
 * Refuse de dumper une base hors garde (défaut naxialis_agent).
 * N’écrit jamais de secrets dans le manifeste.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const BACKUP_ROOT = process.env.BACKUP_ROOT || path.join(rootDir, "backups");
const CONTAINER = process.env.POSTGRES_CONTAINER || "naxialis-agent-postgres-1";
const PGUSER = process.env.POSTGRES_USER || "naxialis";
const PGDB = process.env.POSTGRES_DB || "naxialis_agent";
const GUARD = process.env.DATABASE_NAME_GUARD || "naxialis_agent";
const APP_VERSION = process.env.APP_VERSION || "v7.16.3-local";

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function die(msg) {
  console.error("[backup]", msg);
  process.exit(1);
}

mkdirSync(BACKUP_ROOT, { recursive: true });

const lockPath = path.join(BACKUP_ROOT, ".backup.lock");
if (existsSync(lockPath)) {
  die(`lock présent: ${lockPath}`);
}
writeFileSync(lockPath, String(process.pid));
const clearLock = () => {
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
};
process.on("exit", clearLock);
process.on("SIGINT", () => {
  clearLock();
  process.exit(130);
});

const dbActual = sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  PGDB,
  "-Atc",
  "SELECT current_database();",
]);
if (dbActual !== GUARD) {
  die(`base=${dbActual} refusée (attendu ${GUARD})`);
}

const pgVersion = sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  PGDB,
  "-Atc",
  "SHOW server_version;",
]);

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d+Z$/, "Z");
const dest = path.join(BACKUP_ROOT, stamp);
mkdirSync(dest, { recursive: true });

console.log("[backup] dump", dbActual, "→", dest);
sh("docker", [
  "exec",
  CONTAINER,
  "pg_dump",
  "-U",
  PGUSER,
  "-d",
  PGDB,
  "-Fc",
  "-f",
  "/tmp/naxialis_backup.dump",
]);
const dumpFile = path.join(dest, "postgres.dump");
execFileSync("docker", ["cp", `${CONTAINER}:/tmp/naxialis_backup.dump`, dumpFile]);
sh("docker", ["exec", CONTAINER, "rm", "-f", "/tmp/naxialis_backup.dump"]);

const countsRaw = sh("docker", [
  "exec",
  CONTAINER,
  "psql",
  "-U",
  PGUSER,
  "-d",
  PGDB,
  "-Atc",
  `SELECT json_build_object(
    'generations', (SELECT COUNT(*) FROM "ArticleGeneration"),
    'images', (SELECT COUNT(*) FROM "ArticleFeaturedImage"),
    'events', (SELECT COUNT(*) FROM "OpenAiUsageEvent"),
    'wordpressPosts', (SELECT COUNT(*) FROM "WordPressPost"),
    'webflowItems', (SELECT COUNT(*) FROM "WebflowCmsItem")
  );`,
]);

const imagesArchive = path.join(dest, "featured-images.tar.gz");
const imagesSrc = path.join(rootDir, "storage", "featured-images");
if (existsSync(imagesSrc)) {
  try {
    execFileSync("tar", ["-czf", imagesArchive, "-C", imagesSrc, "."], {
      stdio: "ignore",
    });
  } catch {
    writeFileSync(imagesArchive, Buffer.from(""));
  }
} else {
  writeFileSync(imagesArchive, Buffer.from(""));
}

const dumpSha = sha256File(dumpFile);
const imgSha = sha256File(imagesArchive);
const manifest = {
  createdAt: stamp,
  appVersion: APP_VERSION,
  database: dbActual,
  postgresVersion: pgVersion,
  dumpFile: "postgres.dump",
  dumpSha256: dumpSha,
  featuredImagesArchive: "featured-images.tar.gz",
  featuredImagesSha256: imgSha,
  counts: JSON.parse(countsRaw),
  notes: [
    "Secrets de déchiffrement hors dump — sauvegarde séparée chiffrée.",
    "Copie uniquement sur le même VPS ≠ protection contre perte serveur.",
  ],
};
writeFileSync(
  path.join(dest, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);
console.log("[backup] OK", dest);
console.log(
  JSON.stringify({ dumpSha256: dumpSha, counts: manifest.counts }, null, 2)
);
