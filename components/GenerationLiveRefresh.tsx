"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { GenerationStatus } from "@/lib/status";

const POLL_MS = 2500;

export function GenerationLiveRefresh({
  id,
  status,
  progressStage,
  progressMessage,
}: {
  id: string;
  status: GenerationStatus;
  progressStage?: string | null;
  progressMessage?: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "queued" && status !== "running") {
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
      };
      if (
        payload.status !== status ||
        (payload.progressStage ?? null) !== (progressStage ?? null) ||
        (payload.progressMessage ?? null) !== (progressMessage ?? null)
      ) {
        router.refresh();
      }
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [id, status, progressStage, progressMessage, router]);

  return null;
}
