"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";
import {
  dashboardCardClassName,
  dashboardCardHeaderClassName,
  dashboardIconBadgeClassName,
} from "@/components/dashboard/card-shell";
import { TopicStatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/format";
import type { TopicStatus } from "@/lib/status";

export type DashboardTopicRow = {
  id: string;
  subject: string;
  status: TopicStatus;
  origin?: string | null;
  createdAt: Date | string;
};

export function DashboardTopicPreview({ topics }: { topics: DashboardTopicRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateTopic(topic: DashboardTopicRow) {
    setPendingId(topic.id);
    setError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Impossible de lancer la génération.");
      }
      router.push(`/articles/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
      setPendingId(null);
    }
  }

  return (
    <Card className={`h-full ${dashboardCardClassName}`}>
      <CardHeader className={dashboardCardHeaderClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={dashboardIconBadgeClassName}>
                <Inbox className="size-4" aria-hidden />
              </span>
              <CardTitle className="text-base font-semibold text-[#0F172A]">
                File éditoriale
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-slate-500">
              3 sujets récents. File complète sur File éditoriale.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-[#E2E8F0] text-sm"
            nativeButton={false}
            render={<Link href="/topics" />}
          >
            Ouvrir la file
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        {error ? (
          <p className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {topics.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-600">
            Aucun sujet dans la file pour le moment.
          </p>
        ) : (
          <ul>
            {topics.map((topic, index) => (
              <li key={topic.id}>
                {index > 0 ? <Separator className="bg-[#E2E8F0]" /> : null}
                <div className="flex items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-[#0F172A]">
                      {topic.subject}
                      {topic.origin === "veille" ? (
                        <span className="ml-2 align-middle rounded-full border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Veille
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(topic.createdAt)}
                    </p>
                    <div className="mt-2">
                      <TopicStatusBadge status={topic.status} />
                    </div>
                  </div>
                  {topic.status === "pending" ? (
                    <Button
                      size="sm"
                      disabled={pendingId === topic.id}
                      onClick={() => void generateTopic(topic)}
                      className="h-8 shrink-0 bg-naxialis text-sm text-white hover:bg-naxialis-dark"
                    >
                      {pendingId === topic.id ? "…" : "Générer"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="h-8 shrink-0 border-[#E2E8F0] text-sm"
                    >
                      Générer
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
