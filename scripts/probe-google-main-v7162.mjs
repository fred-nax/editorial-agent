import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL?.trim();
const name = new URL(url).pathname.replace(/^\//, "").split("?")[0];
if (name !== "naxialis_agent") {
  console.error("Refus", name);
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const selections = await db.googlePropertySelection.findMany({
  select: {
    workspaceId: true,
    gscPropertyUrl: true,
    ga4PropertyId: true,
  },
});
const workspaces = await db.editorialWorkspace.findMany({
  select: { id: true, cmsProvider: true, name: true },
});
const syntheticGens = await db.articleGeneration.count({
  where: { subject: { startsWith: "SYNTHETIC" } },
});
const syntheticEvents = await db.openAiUsageEvent.count({
  where: { operationKey: { startsWith: "SYNTHETIC" } },
});
console.log(
  JSON.stringify(
    { database: name, workspaces, selections, syntheticGens, syntheticEvents },
    null,
    2
  )
);
await db.$disconnect();
