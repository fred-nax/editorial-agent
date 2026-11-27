/**
 * Injecte 7 tables Visibility* minimales + marqueur pour tester
 * la préservation GEO lors d’une MAJ (base historique représentative).
 * Ne touche jamais naxialis_agent.
 */
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.POSTGRES_CONTAINER || "naxialis-upgrade-postgres-1";
const PGUSER = process.env.PGUSER || "upgrade";
const PGDB = process.env.PGDB || "naxialis_agent_upgrade";

if (PGDB === "naxialis_agent") {
  console.error("refus naxialis_agent");
  process.exit(1);
}

const ddl = `
CREATE TABLE IF NOT EXISTS "VisibilityBrand" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "VisibilityCampaign" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "VisibilityCitation" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "VisibilityEntity" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "VisibilityMention" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "VisibilityQuestion" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "VisibilityResponse" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "VisibilityBrand" (id, name)
VALUES ('geo_preserve_marker_v7163', 'preserve-me')
ON CONFLICT (id) DO NOTHING;
`;

execFileSync(
  "docker",
  ["exec", "-i", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-v", "ON_ERROR_STOP=1"],
  { input: ddl, encoding: "utf8" }
);

const check = execFileSync(
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
      'geoTables', (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Visibility%'),
      'marker', (SELECT COUNT(*)::int FROM "VisibilityBrand" WHERE id='geo_preserve_marker_v7163')
    );`,
  ],
  { encoding: "utf8" }
).trim();

console.log("[inject-geo]", check);
