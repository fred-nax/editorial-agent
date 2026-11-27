/**
 * Mesures de lecture V7.16.2 — base *bench* uniquement.
 * Affiche durée + compteurs Prisma (middleware) pour listes clés.
 */
import "dotenv/config";
import { performance } from "node:perf_hooks";
import { databaseNameFromUrl, db } from "../lib/db";
import { listArticleHistory } from "../lib/articles/history-query";
import {
  getUsageSummary,
  listUsageHistory,
  resolveUsagePeriod,
} from "../lib/openai-usage-aggregate";

function requireBench(): string {
  const name = databaseNameFromUrl(process.env.DATABASE_URL)?.toLowerCase() ?? "";
  if (!name.includes("bench")) {
    throw new Error(`Refus probe hors bench (${name || "unknown"})`);
  }
  return name;
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  console.log(JSON.stringify({ label, ms: Number(ms.toFixed(2)) }));
  return result;
}

async function main() {
  const dbName = requireBench();
  console.log(JSON.stringify({ database: dbName, phase: "start" }));

  const wp = await db.editorialWorkspace.findFirst({
    where: { cmsProvider: "wordpress", name: { startsWith: "SYNTHETIC_V7162" } },
  });
  if (!wp) throw new Error("Workspace synthétique WordPress introuvable — lancer bench:seed");

  const period = resolveUsagePeriod({ preset: "year" });

  // Cold
  await timed("history_page1_cold", () =>
    listArticleHistory({ workspaceId: wp.id, page: 1, pageSize: 20 })
  );
  // Hot
  const hist = await timed("history_page1_hot", () =>
    listArticleHistory({ workspaceId: wp.id, page: 1, pageSize: 20 })
  );
  await timed("history_page5", () =>
    listArticleHistory({ workspaceId: wp.id, page: 5, pageSize: 20 })
  );

  // Unbounded baseline comparison (ce que faisait l’ancienne page)
  await timed("history_findMany_full_select_star", async () => {
    return db.articleGeneration.findMany({
      where: { workspaceId: wp.id },
      orderBy: { createdAt: "desc" },
    });
  });
  await timed("history_findMany_full_select_list_fields", async () => {
    return db.articleGeneration.findMany({
      where: { workspaceId: wp.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subject: true,
        title: true,
        status: true,
        createdAt: true,
        wpPostId: true,
        cmsDestination: true,
        cmsExternalId: true,
        estimatedCost: true,
        progressStage: true,
      },
    });
  });

  await timed("usage_summary", () =>
    getUsageSummary({
      workspaceId: wp.id,
      from: period.from,
      to: period.to,
      operationType: "all",
      model: "all",
      status: "all",
      completeness: "all",
    })
  );
  await timed("usage_history_page1", () =>
    listUsageHistory({
      workspaceId: wp.id,
      from: period.from,
      to: period.to,
      page: 1,
      pageSize: 25,
    })
  );

  const invCount = await timed("wp_inventory_page", () =>
    db.wordPressPost.findMany({
      where: { workspaceId: wp.id },
      orderBy: { modifiedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        contentType: true,
        modifiedAt: true,
      },
    })
  );

  console.log(
    JSON.stringify({
      phase: "done",
      historyTotal: hist.total,
      historyPageLen: hist.articles.length,
      inventorySample: invCount.length,
    })
  );
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
