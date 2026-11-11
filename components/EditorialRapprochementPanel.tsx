"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EDITORIAL_CHECK_DEBOUNCE_MS,
  MIN_SUBJECT_CHARS_FOR_CHECK,
} from "@/lib/topics/editorial-similarity-config";
import {
  RAPPROCHEMENT_LABELS,
  type RapprochementKind,
} from "@/lib/topics/editorial-similarity-types";

type ApiMatch = {
  kind: RapprochementKind;
  title: string;
  url: string;
  explanation: string;
  message: string;
  wpPostId: number;
};

type CheckPayload = {
  matches?: ApiMatch[];
  hasMatches?: boolean;
  coverage?: string;
  coverageNote?: string;
  lastSyncAt?: string | null;
  inventoryStale?: boolean;
  publishedCount?: number;
  skipped?: boolean;
  error?: string;
  ai?: boolean;
  note?: string;
};

function kindStyles(kind: RapprochementKind): string {
  if (kind === "probable_duplicate") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (kind === "close") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function formatSyncDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function EditorialRapprochementPanel({
  subject,
  angle,
  layout = "full",
  disabled = false,
}: {
  subject: string;
  angle?: string;
  layout?: "full" | "compact";
  disabled?: boolean;
}) {
  const reactId = useId();
  const [phase, setPhase] = useState<"idle" | "checking" | "ready" | "error">(
    "idle"
  );
  const [payload, setPayload] = useState<CheckPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (disabled) {
      return;
    }
    const cleaned = subject.replace(/\s+/g, " ").trim();
    if (cleaned.length < MIN_SUBJECT_CHARS_FOR_CHECK) {
      setPhase("idle");
      setPayload(null);
      setError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const seq = ++requestSeq.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase("checking");
      setError(null);

      const body: Record<string, string> = {
        mode: "editorial",
        subject: cleaned,
      };
      const angleValue = angle?.replace(/\s+/g, " ").trim();
      if (angleValue) {
        body.angle = angleValue;
      }

      void fetch("/api/topics/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = (await response.json()) as CheckPayload;
          if (seq !== requestSeq.current) {
            return;
          }
          if (!response.ok) {
            throw new Error(data.error ?? "Vérification impossible.");
          }
          setPayload(data);
          setPhase("ready");
        })
        .catch((err: unknown) => {
          if (seq !== requestSeq.current) {
            return;
          }
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          setPhase("error");
          setError(
            err instanceof Error ? err.message : "Vérification impossible."
          );
        });
    }, EDITORIAL_CHECK_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [subject, angle, disabled]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function runAiAnalysis() {
    const cleaned = subject.replace(/\s+/g, " ").trim();
    if (!cleaned || aiBusy) {
      return;
    }
    setAiBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        subject: cleaned,
        candidates: payload?.matches ?? [],
      };
      const angleValue = angle?.replace(/\s+/g, " ").trim();
      if (angleValue) {
        body.angle = angleValue;
      }
      const response = await fetch("/api/topics/analyze-similarity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as CheckPayload;
      if (!response.ok) {
        throw new Error(data.error ?? "Analyse IA impossible.");
      }
      setPayload(data);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse IA impossible.");
    } finally {
      setAiBusy(false);
    }
  }

  async function refreshInventory() {
    if (syncBusy) {
      return;
    }
    setSyncBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/wordpress-inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "incremental" }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Synchronisation impossible.");
      }
      // Relance la vérification locale après demande de sync.
      requestSeq.current += 1;
      setPhase("idle");
      setPayload(null);
      // Force re-check by toggling via microtask subject dependency: call check now.
      const cleaned = subject.replace(/\s+/g, " ").trim();
      if (cleaned.length >= MIN_SUBJECT_CHARS_FOR_CHECK) {
        setPhase("checking");
        const body: Record<string, string> = {
          mode: "editorial",
          subject: cleaned,
        };
        const angleValue = angle?.replace(/\s+/g, " ").trim();
        if (angleValue) {
          body.angle = angleValue;
        }
        const check = await fetch("/api/topics/check-duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const checkData = (await check.json()) as CheckPayload;
        if (!check.ok) {
          throw new Error(checkData.error ?? "Vérification impossible.");
        }
        setPayload(checkData);
        setPhase("ready");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Synchronisation impossible."
      );
    } finally {
      setSyncBusy(false);
    }
  }

  const matches = payload?.matches ?? [];
  const hasMatches = Boolean(payload?.hasMatches && matches.length > 0);
  const syncLabel = formatSyncDate(payload?.lastSyncAt);
  const showPanel = phase !== "idle" || Boolean(error);

  if (!showPanel && layout === "compact") {
    return null;
  }

  const resultsBlock = (
    <div className="space-y-3">
      {phase === "checking" ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Analyse des articles publiés…
        </p>
      ) : null}

      {phase === "ready" && !hasMatches && !payload?.skipped ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Aucun article présentant un rapprochement significatif n’a été trouvé
          dans l’inventaire actuel.
        </p>
      ) : null}

      {phase === "ready" && hasMatches ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#0F172A]">
            Articles proches détectés
          </p>
          <p className="text-xs text-slate-600">
            Un contenu similaire existe déjà. Vous pouvez affiner votre angle ou
            continuer la rédaction.
          </p>
          <ul className="space-y-2">
            {matches.map((match) => (
              <li
                key={`${match.wpPostId}-${match.kind}`}
                className="rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#0F172A]">
                      {match.title}
                    </p>
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${kindStyles(match.kind)}`}
                    >
                      {RAPPROCHEMENT_LABELS[match.kind]}
                    </span>
                    <p className="mt-1.5 text-xs text-slate-600">
                      {match.message}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {match.explanation}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="shrink-0 border-[#E2E8F0] bg-white"
                    nativeButton={false}
                    render={
                      <a href={match.url} target="_blank" rel="noreferrer" />
                    }
                  >
                    <ExternalLink data-icon="inline-start" />
                    Voir l&apos;article
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#E2E8F0] bg-white"
              disabled={aiBusy}
              onClick={() => void runAiAnalysis()}
            >
              {aiBusy ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              Analyser plus précisément avec l&apos;IA
            </Button>
          </div>
          {payload?.ai ? (
            <p className="text-[11px] text-slate-500">
              Classement affiné par analyse IA (titres / extraits disponibles
              uniquement).
            </p>
          ) : null}
        </div>
      ) : null}

      {(payload?.inventoryStale || payload?.coverage === "partial") &&
      phase === "ready" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p>
            {payload.coverageNote}
            {syncLabel ? ` · Dernière sync : ${syncLabel}` : ""}
          </p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="border-amber-300 bg-white"
            disabled={syncBusy}
            onClick={() => void refreshInventory()}
          >
            {syncBusy ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            Actualiser les articles WordPress
          </Button>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );

  if (layout === "compact") {
    const summary =
      phase === "checking"
        ? "Analyse…"
        : hasMatches
          ? `${matches.length} rapprochement${matches.length > 1 ? "s" : ""}`
          : phase === "ready"
            ? "Aucun rapprochement"
            : null;

    if (!summary && !error) {
      return null;
    }

    return (
      <div className="space-y-2">
        <button
          type="button"
          className="text-left text-xs font-medium text-naxialis underline-offset-2 hover:underline"
          onClick={() => setCompactOpen(true)}
          id={`${reactId}-compact-trigger`}
        >
          {summary ?? "Voir la vérification éditoriale"}
        </button>
        <Dialog open={compactOpen} onOpenChange={setCompactOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Rapprochements éditoriaux</DialogTitle>
              <DialogDescription>
                Vérification informative — la rédaction reste possible.
              </DialogDescription>
            </DialogHeader>
            {resultsBlock}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (!showPanel) {
    return null;
  }

  return (
    <section
      className="space-y-3 rounded-lg border border-[#E2E8F0] bg-slate-50/40 p-3"
      aria-live="polite"
    >
      <p className="text-sm font-medium text-[#0F172A]">
        Vérification des articles publiés
      </p>
      {resultsBlock}
    </section>
  );
}
