/**
 * Exécute une commande avec DATABASE_URL → naxialis_agent_v7113_migtest.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

const source = process.env.DATABASE_URL?.trim();
if (!source) {
  console.error("DATABASE_URL manquant (.env)");
  process.exit(1);
}

const match = source.match(/^(postgresql:\/\/[^/]+)\/([^?]+)(\?.*)?$/i);
if (!match) {
  console.error("DATABASE_URL illisible");
  process.exit(1);
}

const migUrl = `${match[1]}/naxialis_agent_v7113_migtest${match[3] ?? ""}`;
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/with-migtest-db.mjs <cmd> [args...]");
  process.exit(1);
}

console.log("[with-migtest-db] database=naxialis_agent_v7113_migtest");
const result = spawnSync(args[0], args.slice(1), {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: migUrl },
  shell: true,
});
process.exit(result.status ?? 1);
