import type { Metadata } from "next";
import { ArticleForm } from "@/components/ArticleForm";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Nouvel article",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  topicId?: string | string[];
  preferredTitle?: string | string[];
}>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return value?.trim() ?? "";
}

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const topicId = firstParam(params.topicId);
  const preferredTitleParam = firstParam(params.preferredTitle);

  let initial:
    | {
        topicId?: string;
        subject?: string;
        angle?: string;
        notes?: string;
        preferredTitle?: string;
      }
    | undefined;

  if (topicId) {
    const topic = await db.topic.findUnique({ where: { id: topicId } });
    if (topic && topic.status === "pending") {
      initial = {
        topicId: topic.id,
        subject: topic.subject,
        angle: topic.angle ?? undefined,
        notes: topic.notes ?? undefined,
        preferredTitle: preferredTitleParam || undefined,
      };
    }
  } else if (preferredTitleParam) {
    initial = { preferredTitle: preferredTitleParam };
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
          Nouvel article
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Préparez le sujet, choisissez la destination CMS, lancez la
          génération, puis finalisez le brouillon (WordPress uniquement pour
          l’instant).
        </p>
        {initial?.topicId ? (
          <p className="mt-2 text-xs text-slate-500">
            Sujet issu de la file éditoriale — le statut de la file sera mis à
            jour à la génération.
          </p>
        ) : null}
      </div>
      <ArticleForm initial={initial} />
    </div>
  );
}
