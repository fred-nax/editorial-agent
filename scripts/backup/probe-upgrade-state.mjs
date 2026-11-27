import { execFileSync } from "node:child_process";

const CONTAINER = process.env.POSTGRES_CONTAINER || "naxialis-upgrade-postgres-1";
const PGUSER = process.env.PGUSER || "upgrade";
const PGDB = process.env.PGDB || "naxialis_agent_upgrade";

function sql(q) {
  return execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-Atc", q],
    { encoding: "utf8" }
  ).trim();
}

const counts = sql(`SELECT json_build_object(
  'generations', (SELECT COUNT(*)::int FROM "ArticleGeneration"),
  'images', (SELECT COUNT(*)::int FROM "ArticleFeaturedImage"),
  'events', (SELECT COUNT(*)::int FROM "OpenAiUsageEvent"),
  'wordpressPosts', (SELECT COUNT(*)::int FROM "WordPressPost"),
  'webflowItems', (SELECT COUNT(*)::int FROM "WebflowCmsItem"),
  'workspaces', (SELECT COUNT(*)::int FROM "EditorialWorkspace"),
  'settings', (SELECT COUNT(*)::int FROM "AppSettings"),
  'googleSelections', (SELECT COUNT(*)::int FROM "GooglePropertySelection"),
  'migrations', (SELECT COUNT(*)::int FROM "_prisma_migrations"),
  'geoTables', (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Visibility%'),
  'webflowCostSum', (SELECT COALESCE(SUM("estimatedCost"),0)::text FROM "ArticleGeneration" WHERE "workspaceId"='ws_webflow_ai_studio_01'),
  'imageFilesMeta', (SELECT COUNT(*)::int FROM "ArticleFeaturedImage" WHERE "relativePath" IS NOT NULL AND "relativePath" <> 'pending')
);`);

const encPresence = sql(`SELECT json_build_object(
  'openaiApiKeyEncrypted', ("openaiApiKeyEncrypted" IS NOT NULL AND length("openaiApiKeyEncrypted") > 0),
  'wpAppPasswordEncrypted', ("wpAppPasswordEncrypted" IS NOT NULL AND length("wpAppPasswordEncrypted") > 0),
  'webflowApiTokenEncrypted', ("webflowApiTokenEncrypted" IS NOT NULL AND length("webflowApiTokenEncrypted") > 0),
  'siteNamePresent', ("siteName" IS NOT NULL AND length("siteName") > 0)
) FROM "AppSettings" WHERE id='default';`);

const geoNames = sql(
  `SELECT COALESCE(string_agg(tablename, ',' ORDER BY tablename), '') FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Visibility%';`
);

console.log(
  JSON.stringify(
    {
      database: PGDB,
      counts: JSON.parse(counts),
      encryptedFieldsPresent: encPresence ? JSON.parse(encPresence) : null,
      geoTables: geoNames ? geoNames.split(",").filter(Boolean) : [],
    },
    null,
    2
  )
);
