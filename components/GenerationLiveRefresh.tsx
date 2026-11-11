"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { GenerationStatus } from "@/lib/status";

const POLL_MS = 2500;

function featuredNeedsPoll(status: string | null | undefined): boolean {
  return status === "pending" || status === "generating";
}

export function GenerationLiveRefresh({
  id,
  status,
  progressStage,
  progressMessage,
  featuredImageStatus,
}: {
  id: string;
  status: GenerationStatus;
  progressStage?: string | null;
  progressMessage?: string | null;
  featuredImageStatus?: string | null;
}) {
  const router = useRouter();
  const articleBusy = status === "queued" || status === "running";
  const imageBusy = featuredNeedsPoll(featuredImageStatus);

  useEffect(() => {
    if (!articleBusy && !imageBusy) {
      return;
    }

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/articles/${id}`);
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        status?: GenerationStatus;
        progressStage?: string | null;
        progressMessage?: string | null;
        featuredImage?: { status?: string } | null;
      };
      const nextFeatured = payload.featuredImage?.status ?? null;
      if (
        payload.status !== status ||
        (payload.progressStage ?? null) !== (progressStage ?? null) ||
        (payload.progressMessage ?? null) !== (progressMessage ?? null) ||
        nextFeatured !== (featuredImageStatus ?? null)
      ) {
        router.refresh();
      }
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [
    id,
    status,
    progressStage,
    progressMessage,
    featuredImageStatus,
    articleBusy,
    imageBusy,
    router,
  ]);

  return null;
}
