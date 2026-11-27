import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL manquant");
  process.exit(1);
}
const name = new URL(url).pathname.replace(/^\//, "").split("?")[0];
if (name !== "naxialis_agent") {
  console.error("Refus : attendu naxialis_agent, reçu", name);
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const [generations, images, events, wordpressPosts, webflowItems] = await Promise.all([
  db.articleGeneration.count(),
  db.articleFeaturedImage.count(),
  db.openAiUsageEvent.count(),
  db.wordPressPost.count(),
  db.webflowCmsItem.count(),
]);
const wf = await db.articleGeneration.aggregate({
  where: { cmsDestination: "webflow", estimatedCost: { not: null } },
  _sum: { estimatedCost: true },
});
const latest = await db.articleGeneration.findFirst({
  orderBy: { createdAt: "desc" },
  select: { id: true },
});
const evSum = latest
  ? await db.openAiUsageEvent.aggregate({
      where: { generationId: latest.id },
      _sum: { estimatedCostUsd: true },
    })
  : null;

console.log(
  JSON.stringify(
    {
      database: name,
      generations,
      images,
      events,
      wordpressPosts,
      webflowItems,
      webflowHistoricalCostSum: wf._sum.estimatedCost,
      latestArticleId: latest?.id ?? null,
      latestArticleEventsCost: evSum?._sum.estimatedCostUsd ?? null,
    },
    null,
    2
  )
);
await db.$disconnect();
