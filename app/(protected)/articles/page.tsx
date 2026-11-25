import type { Metadata } from "next";
import { ArticleHistory } from "@/components/ArticleHistory";
import { db } from "@/lib/db";
import { recoverStaleGenerations } from "@/lib/generation-recovery";
import { resolveActiveWorkspace, workspaceWhere } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Historique",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ArticlesPage() {
  await recoverStaleGenerations();
  const workspace = await resolveActiveWorkspace();
  const cmsLabel =
    workspace.cmsProvider === "webflow" ? "Webflow" : "WordPress";

  const articles = await db.articleGeneration.findMany({
    where: workspaceWhere(workspace.id),
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Historique</h1>
        <p className="mt-1 text-sm text-slate-600">
          Générations {cmsLabel} de l&apos;espace {workspace.name}.
        </p>
      </div>
      <ArticleHistory articles={articles} />
    </div>
  );
}
