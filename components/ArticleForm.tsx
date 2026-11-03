"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GenerationProgress } from "@/components/GenerationProgress";
import type { GenerationStatus } from "@/lib/status";

type GenerationSnapshot = {
  id: string;
  status: GenerationStatus;
  title: string | null;
  wpPostId: number | null;
  wpUrl: string | null;
  error: string | null;
  subject?: string | null;
  progressStage?: string | null;
  progressMessage?: string | null;
  progressUpdatedAt?: string | null;
  createdAt?: string | null;
  durationMs?: number | null;
};

const POLL_MS = 2500;

function statusLabel(
  phase: "idle" | "preparing" | GenerationStatus
): string {
  if (phase === "idle") {
    return "Générer l’article";
  }
  if (phase === "preparing") {
    return "Préparation…";
  }
  if (phase === "queued") {
    return "En attente";
  }
  if (phase === "running") {
    return "Génération en cours";
  }
  if (phase === "completed") {
    return "Brouillon créé";
  }
  if (phase === "failed") {
    return "Échec";
  }
  return "Générer l’article";
}

export function ArticleForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [phase, setPhase] = useState<"idle" | "preparing" | GenerationStatus>(
    "idle"
  );
  const [generation, setGeneration] = useState<GenerationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const lastProgressRef = useRef<string | null>(null);

  const busy = phase === "preparing" || phase === "queued" || phase === "running";

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(id: string) {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/articles/${id}`);
        const payload = (await response.json()) as GenerationSnapshot & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Suivi impossible.");
        }

        setGeneration(payload);
        setPhase(payload.status);

        const progressKey = `${payload.status}:${payload.progressStage ?? ""}:${payload.progressMessage ?? ""}`;
        if (lastProgressRef.current !== progressKey) {
          lastProgressRef.current = progressKey;
          router.refresh();
        }

        if (payload.status === "completed" || payload.status === "failed") {
          stopPolling();
          if (payload.status === "failed") {
            setError(payload.error ?? "La génération a échoué.");
          }
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Suivi impossible.");
      }
    }, POLL_MS);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }

    const value = subject.trim();
    if (!value) {
      return;
    }

    setError(null);
    setGeneration(null);
    setPhase("preparing");
    setStartedAt(new Date().toISOString());
    lastProgressRef.current = null;

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: value }),
      });
      const payload = (await response.json()) as {
        id?: string;
        status?: GenerationStatus;
        progressStage?: string | null;
        progressMessage?: string | null;
        progressUpdatedAt?: string | null;
        createdAt?: string;
        error?: string;
      };

      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Impossible de lancer la génération.");
      }

      setGeneration({
        id: payload.id,
        status: payload.status ?? "queued",
        title: null,
        wpPostId: null,
        wpUrl: null,
        error: null,
        subject: value,
        progressStage: payload.progressStage ?? "queued",
        progressMessage: payload.progressMessage ?? "En file d’attente…",
        progressUpdatedAt: payload.progressUpdatedAt ?? null,
        createdAt: payload.createdAt ?? new Date().toISOString(),
      });
      setPhase(payload.status ?? "queued");
      startPolling(payload.id);
    } catch (err) {
      setPhase("failed");
      setError(err instanceof Error ? err.message : "La génération a échoué.");
    }
  }

  const showProgress =
    generation &&
    (phase === "preparing" ||
      phase === "queued" ||
      phase === "running" ||
      phase === "failed");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-800">
          Sujet de l’article
        </span>
        <textarea
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            if (phase === "completed" || phase === "failed") {
              setPhase("idle");
              setGeneration(null);
              setError(null);
              setStartedAt(null);
            }
          }}
          rows={3}
          required
          disabled={busy}
          placeholder="Ex. Comment utiliser un agent IA dans une PME ?"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-naxialis focus:ring-2 focus:ring-naxialis/20 disabled:bg-slate-50"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center rounded-md bg-naxialis px-4 py-2.5 text-sm font-medium text-white hover:bg-naxialis-dark disabled:opacity-60"
        >
          {statusLabel(busy ? phase : "idle")}
        </button>
        {phase !== "idle" && !showProgress ? (
          <p className="text-xs text-slate-500">{statusLabel(phase)}</p>
        ) : null}
      </div>

      {showProgress ? (
        <GenerationProgress
          status={phase === "preparing" ? "queued" : phase}
          progressStage={generation.progressStage}
          progressMessage={
            phase === "preparing"
              ? "Préparation de la génération…"
              : generation.progressMessage
          }
          createdAt={generation.createdAt ?? startedAt}
          durationMs={generation.durationMs}
          wpPostId={generation.wpPostId}
          subject={generation.subject ?? subject}
        />
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {generation && phase === "completed" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
          <p className="font-medium">{generation.title ?? "Brouillon créé"}</p>
          {generation.wpPostId ? (
            <p className="mt-1 text-emerald-900">
              WordPress #{generation.wpPostId}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {generation.wpUrl ? (
              <a
                href={generation.wpUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-naxialis px-3 py-1.5 text-xs font-medium text-white hover:bg-naxialis-dark"
              >
                Ouvrir dans WordPress
              </a>
            ) : null}
            <Link
              href={`/articles/${generation.id}`}
              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
            >
              Voir le détail
            </Link>
          </div>
        </div>
      ) : null}
    </form>
  );
}
