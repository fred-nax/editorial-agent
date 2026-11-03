import type { Metadata } from "next";
import { ArticleForm } from "@/components/ArticleForm";
import { ArticleHistory } from "@/components/ArticleHistory";
import { TopicQueue } from "@/components/TopicQueue";
import { db } from "@/lib/db";
import { formatEstimatedCost } from "@/lib/format";
import { recoverStaleGenerations } from "@/lib/generation-recovery";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500" title={hint}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </section>
  );
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function DashboardPage() {
  await recoverStaleGenerations();
  const monthStart = startOfCurrentMonth();

  const [
    draftsThisMonth,
    pendingTopics,
    runningGenerations,
    llmCostThisMonth,
    recentArticles,
    recentTopics,
  ] = await Promise.all([
    db.articleGeneration.count({
      where: {
        status: "completed",
        createdAt: { gte: monthStart },
      },
    }),
    db.topic.count({
      where: { status: "pending" },
    }),
    db.articleGeneration.count({
      where: {
        status: { in: ["queued", "running"] },
      },
    }),
    db.articleGeneration.aggregate({
      where: {
        status: "completed",
        createdAt: { gte: monthStart },
        estimatedCost: { not: null },
      },
      _sum: { estimatedCost: true },
    }),
    db.articleGeneration.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.topic.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bonjour</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pilotez votre agent éditorial et vos brouillons WordPress.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Brouillons ce mois" value={draftsThisMonth} />
        <StatCard label="Sujets en attente" value={pendingTopics} />
        <StatCard label="Générations en cours" value={runningGenerations} />
        <StatCard
          label="Coût LLM ce mois"
          value={formatEstimatedCost(llmCostThisMonth._sum.estimatedCost)}
          hint="Hors éventuels frais liés aux outils."
        />
      </div>

      <section
        id="nouveau-sujet"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 className="text-base font-semibold text-slate-900">Nouvel article</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500">
          Saisissez un sujet. La génération crée un brouillon WordPress.
        </p>
        <ArticleForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Générations récentes
        </h2>
        <ArticleHistory articles={recentArticles} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">File de sujets</h2>
        <TopicQueue topics={recentTopics} />
      </section>
    </div>
  );
}
