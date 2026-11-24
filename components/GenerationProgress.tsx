"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/format";
import {
  failedStepLabel,
  getGenerationTimelineSteps,
  resolveFailedDisplayStage,
  resolveProgressStage,
  timelineStepState,
  type TimelineStepState,
} from "@/lib/progress";
import type { GenerationStatus } from "@/lib/status";

export type GenerationProgressProps = {
  status: GenerationStatus;
  progressStage?: string | null;
  progressMessage?: string | null;
  createdAt?: string | Date | null;
  durationMs?: number | null;
  wpPostId?: number | null;
  cmsDestination?: string | null;
  cmsExternalId?: string | null;
  subject?: string | null;
};

function useElapsedMs(
  createdAt: string | Date | null | undefined,
  durationMs: number | null | undefined,
  live: boolean
): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  if (typeof durationMs === "number" && durationMs >= 0 && !live) {
    return durationMs;
  }

  if (!createdAt) {
    return 0;
  }

  const start =
    createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (Number.isNaN(start)) {
    return 0;
  }
  return Math.max(0, now - start);
}

function StepMark({ state }: { state: TimelineStepState }) {
  if (state === "complete") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full bg-naxialis text-[11px] font-semibold text-white"
        aria-hidden
      >
        ✓
      </span>
    );
  }

  if (state === "failed") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-[11px] font-semibold text-white"
        aria-hidden
      >
        !
      </span>
    );
  }

  if (state === "current") {
    return (
      <span className="relative flex h-6 w-6 items-center justify-center" aria-hidden>
        <span className="absolute inline-flex h-6 w-6 animate-ping rounded-full bg-naxialis/30" />
        <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-naxialis bg-white">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-naxialis" />
        </span>
      </span>
    );
  }

  return (
    <span
      className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] text-slate-400"
      aria-hidden
    >
      ○
    </span>
  );
}

function barClass(state: TimelineStepState): string {
  if (state === "complete") {
    return "bg-naxialis";
  }
  if (state === "failed") {
    return "bg-red-600";
  }
  if (state === "current") {
    return "bg-naxialis/70 animate-pulse";
  }
  return "bg-slate-200";
}

export function GenerationProgress({
  status,
  progressStage,
  progressMessage,
  createdAt,
  durationMs,
  wpPostId,
  cmsDestination,
  cmsExternalId,
  subject,
}: GenerationProgressProps) {
  const stage = resolveProgressStage(status, progressStage);
  const live = status === "queued" || status === "running";
  const elapsedMs = useElapsedMs(createdAt, durationMs, live);
  const failed = status === "failed" || stage === "failed";
  const failureDisplayStage = failed
    ? resolveFailedDisplayStage(status, stage)
    : stage;
  const timeline = getGenerationTimelineSteps(cmsDestination);
  const isWebflow = cmsDestination === "webflow";

  const heading =
    status === "completed"
      ? "Article terminé"
      : failed
        ? "La génération a échoué"
        : "Génération de votre article";

  const message =
    progressMessage ||
    (failed ? "La génération a échoué." : "Préparation de la génération…");

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">
      <p className="text-sm font-semibold text-slate-900">{heading}</p>
      {subject ? (
        <p className="mt-1 text-sm text-slate-600">
          <span className="text-slate-500">Sujet :</span> {subject}
        </p>
      ) : null}
      {cmsDestination ? (
        <p className="mt-1 text-xs text-slate-500">
          Destination : {isWebflow ? "Webflow" : "WordPress"}
        </p>
      ) : null}

      {status === "completed" ? (
        <p className="mt-3 text-sm text-emerald-800">
          {isWebflow
            ? cmsExternalId
              ? `Brouillon Webflow créé (id ${cmsExternalId})`
              : "Brouillon Webflow créé"
            : wpPostId
              ? `Brouillon WordPress #${wpPostId} créé`
              : "Brouillon WordPress créé"}
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-5 gap-1" aria-hidden>
            {timeline.map((step) => {
              const state = timelineStepState(
                step.stage,
                status,
                failureDisplayStage
              );
              return (
                <div
                  key={step.stage}
                  className={`h-1.5 rounded-full ${barClass(state)}`}
                />
              );
            })}
          </div>

          <ol className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-2">
            {timeline.map((step) => {
              const state = timelineStepState(
                step.stage,
                status,
                failureDisplayStage
              );
              const isFailedCurrent = failed && state === "failed";
              const label = isFailedCurrent
                ? failedStepLabel(failureDisplayStage)
                : step.label;
              const currentMessage =
                state === "current" || isFailedCurrent ? message : null;

              return (
                <li
                  key={step.stage}
                  className="flex min-w-0 items-start gap-3 md:flex-1 md:flex-col md:items-center md:text-center"
                >
                  <StepMark state={state} />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        state === "upcoming"
                          ? "text-slate-400"
                          : isFailedCurrent
                            ? "text-red-700"
                            : "text-slate-800"
                      } ${state === "current" ? "animate-pulse" : ""}`}
                    >
                      {label}
                    </p>
                    {currentMessage ? (
                      <p
                        className={`mt-0.5 text-xs ${
                          isFailedCurrent ? "text-red-600" : "text-naxialis-muted"
                        }`}
                      >
                        {currentMessage}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Temps écoulé : {formatElapsed(elapsedMs)}
      </p>
    </div>
  );
}
