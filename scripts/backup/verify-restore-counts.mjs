import { execFileSync } from "node:child_process";

function q(db, sql) {
  return execFileSync(
    "docker",
    ["exec", "naxialis-agent-postgres-1", "psql", "-U", "naxialis", "-d", db, "-Atc", sql],
    { encoding: "utf8" }
  ).trim();
}

const restoreCost = q(
  "naxialis_agent_restore_v7163",
  `SELECT ROUND(SUM("estimatedCost")::numeric,6) FROM "ArticleGeneration" WHERE "cmsDestination"='webflow' AND "estimatedCost" IS NOT NULL`
);
const main = q(
  "naxialis_agent",
  `SELECT json_build_object(
    'database', current_database(),
    'generations', (SELECT COUNT(*) FROM "ArticleGeneration"),
    'events', (SELECT COUNT(*) FROM "OpenAiUsageEvent"),
    'webflowCost', (SELECT ROUND(SUM("estimatedCost")::numeric,6) FROM "ArticleGeneration" WHERE "cmsDestination"='webflow' AND "estimatedCost" IS NOT NULL)
  )`
);
console.log(JSON.stringify({ restoreWebflowCost: restoreCost, main: JSON.parse(main) }, null, 2));
