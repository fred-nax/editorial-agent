import type { Metadata } from "next";
import { ArticleHistory } from "@/components/ArticleHistory";
import { db } from "@/lib/db";
import { recoverStaleGenerations } from "@/lib/generation-recovery";

export const metadata: Metadata = {
  title: "Historique",
};

export const dynamic = "force-dynamic";

export default async function ArticlesPage() {
  await recoverStaleGenerations();
  const articles = await db.articleGeneration.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Historique</h1>
        <p className="mt-1 text-sm text-slate-600">
          Les générations enregistrées en base apparaissent ici.
        </p>
      </div>
      <ArticleHistory articles={articles} />
    </div>
  );
}
