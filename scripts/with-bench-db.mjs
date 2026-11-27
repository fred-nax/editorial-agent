/**
 * Exécute une commande avec DATABASE_URL pointant vers naxialis_agent_bench_v7162.
 * Ne journalise jamais le mot de passe.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

const source = process.env.DATABASE_URL?.trim();
if (!source) {
  console.error("DATABASE_URL manquant (.env)");
  process.exit(1);
}

const match = source.match(
  /^(postgresql:\/\/[^/]+)\/([^?]+)(\?.*)?$/i
);
if (!match) {
  console.error("DATABASE_URL illisible");
  process.exit(1);
}

const benchUrl = `${match[1]}/naxialis_agent_bench_v7162${match[3] ?? ""}`;
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/with-bench-db.mjs <cmd> [args...]");
  process.exit(1);
}

console.log("[with-bench-db] database=naxialis_agent_bench_v7162 cmd=", args.join(" "));
const result = spawnSync(args[0], args.slice(1), {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: benchUrl },
  shell: true,
});
process.exit(result.status ?? 1);
