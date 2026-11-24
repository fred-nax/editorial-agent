import type { Metadata } from "next";
import { TopicQueue, type TopicListItem } from "@/components/TopicQueue";
import { db } from "@/lib/db";
import {
  assertModuleAllowedForWorkspace,
  resolveActiveWorkspace,
  workspaceWhere,
} from "@/lib/workspace";

export const metadata: Metadata = {
  title: "File éditoriale",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TopicsPage() {
  const workspace = await resolveActiveWorkspace();
  assertModuleAllowedForWorkspace(workspace, "topics");
  const scope = workspaceWhere(workspace.id);

  const topicsRaw = await db.topic.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
  });

  const priorityRank = (priority: number) =>
    priority === 1 ? 0 : priority === 2 || priority === 3 ? 1 : 2;

  const topics = [...topicsRaw].sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) {
      return byPriority;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const topicIds = topics.map((topic) => topic.id);
  const generations =
    topicIds.length === 0
      ? []
      : await db.articleGeneration.findMany({
          where: { ...scope, topicId: { in: topicIds } },
          select: {
            id: true,
            topicId: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        });

  const articleByTopic = new Map<string, string>();
  for (const generation of generations) {
    if (!generation.topicId || articleByTopic.has(generation.topicId)) {
      continue;
    }
    if (generation.status === "completed") {
      articleByTopic.set(generation.topicId, generation.id);
    }
  }
  for (const generation of generations) {
    if (!generation.topicId || articleByTopic.has(generation.topicId)) {
      continue;
    }
    articleByTopic.set(generation.topicId, generation.id);
  }

  const items: TopicListItem[] = topics.map((topic) => ({
    ...topic,
    articleId: articleByTopic.get(topic.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          File éditoriale
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Organisez vos sujets, préparez un titre, puis lancez la rédaction.
        </p>
      </div>
      <TopicQueue topics={items} />
    </div>
  );
}
