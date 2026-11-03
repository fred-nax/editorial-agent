import type { Metadata } from "next";
import { TopicQueue } from "@/components/TopicQueue";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Sujets",
};

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const topics = await db.topic.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">File de sujets</h1>
        <p className="mt-1 text-sm text-slate-600">
          Enregistrez des idées d’articles sans les générer immédiatement.
        </p>
      </div>
      <TopicQueue topics={topics} />
    </div>
  );
}
