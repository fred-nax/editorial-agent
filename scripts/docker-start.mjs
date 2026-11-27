import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_PATH: [
          "/usr/local/lib/node_modules/prisma/node_modules",
          "/usr/local/lib/node_modules",
          process.env.NODE_PATH,
        ]
          .filter(Boolean)
          .join(":"),
      },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });
}

function bootLog(event, fields = {}) {
  console.info(`[boot] ${event}`, {
    level: "info",
    scope: "boot",
    event,
    ts: new Date().toISOString(),
    ...fields,
  });
}

function databaseNameFromUrl(url) {
  if (!url?.trim()) return null;
  try {
    return new URL(url).pathname.replace(/^\//, "").split("?")[0] || null;
  } catch {
    const m = url.match(/\/([^/?]+)(?:\?|$)/);
    return m?.[1] ?? null;
  }
}

/** INFRA-001 — jamais de drop GEO dans l’image / contexte runtime. */
const dropPath = path.join(
  process.cwd(),
  "prisma/migrations/20261103173400_drop_ai_visibility_monitor"
);
if (existsSync(dropPath) || existsSync(`${dropPath}/migration.sql`)) {
  console.error(
    "[boot] REFUS : migration drop_ai_visibility_monitor présente — arrêt."
  );
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL?.trim();
const dbName = databaseNameFromUrl(dbUrl);
if (!dbName) {
  console.error("[boot] REFUS : DATABASE_URL manquant ou illisible.");
  process.exit(1);
}
const lower = dbName.toLowerCase();
if (
  (lower.includes("migtest") || lower.includes("bench")) &&
  process.env.ALLOW_MIGTEST_DATABASE !== "1"
) {
  console.error(
    `[boot] REFUS : base de test/bench (${dbName}). ALLOW_MIGTEST_DATABASE=1 pour forcer.`
  );
  process.exit(1);
}
bootLog("database identified", { database: dbName });

if (process.env.SKIP_PRISMA_MIGRATE === "1") {
  bootLog("migrate skipped (SKIP_PRISMA_MIGRATE=1)");
} else {
  bootLog("migrate");
  await run("prisma", ["migrate", "deploy"]);
}
bootLog("start");
await run("node", ["server.js"]);
