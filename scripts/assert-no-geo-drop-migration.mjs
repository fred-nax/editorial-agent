/**
 * INFRA-001 / INFRA-004 — refuse la présence de la migration destructive GEO.
 * À exécuter avant build image et au démarrage Docker.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const forbidden = [
  "prisma/migrations/20261103173400_drop_ai_visibility_monitor",
  "prisma/migrations/20261103173400_drop_ai_visibility_monitor/migration.sql",
];

const found = forbidden.filter((rel) => existsSync(path.join(root, rel)));
if (found.length > 0) {
  console.error(
    "[geo-guard] REFUS : migration destructive GEO présente dans le contexte :",
    found.join(", ")
  );
  console.error(
    "[geo-guard] Ne jamais réappliquer drop_ai_visibility_monitor. Retirer du contexte Docker / dépôt."
  );
  process.exit(1);
}

console.log("[geo-guard] OK — drop_ai_visibility_monitor absent du contexte");
