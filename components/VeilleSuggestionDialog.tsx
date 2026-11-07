"use client";

import { useEffect, useRef, useState } from "react";
import type { SeoSuggestion } from "@/lib/veille/suggestions";
import type {
  DuplicateCheckBody,
  DuplicateLevel,
  DuplicateMatch,
  DuplicateSource,
  ProposalDuplicateResult,
} from "@/lib/veille/editorial-duplicates";
import type { VeilleArticle } from "@/lib/veille/types";

const FORMAT_LABELS: Record<SeoSuggestion["format"], string> = {
  guide: "Guide",
  analyse: "Analyse",
  comparatif: "Comparatif",
  checklist: "Checklist",
  autre: "Autre",
};

export const SUGGESTION_SOURCE_LABELS: Record<DuplicateSource, string> = {
  wordpress: "WordPress",
  topic: "File éditoriale",
  generation: "Historique",
};

type Phase =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; suggestions: SeoSuggestion[] };

export async function loadVeilleSuggestions(
  article: VeilleArticle,
  theme: string
): Promise<{ ok: true; suggestions: SeoSuggestion[] } | { ok: false; message: string }> {
  const response = await fetch("/api/veille/suggestions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      theme,
      title: article.title,
      url: article.url,
      sourceName: article.sourceName,
      summary: article.summary,
      event: article.event,
      kind: article.kind,
      publishedOn: article.publishedOn,
      dateVerified: article.dateVerified,
    }),
  });
  const payload = (await response.json()) as {
    suggestions?: SeoSuggestion[];
    error?: string;
  };
  if (!response.ok || !payload.suggestions || payload.suggestions.length !== 3) {
    return {
      ok: false,
      message: payload.error ?? "Les suggestions n’ont pas pu être préparées.",
    };
  }
  return { ok: true, suggestions: payload.suggestions };
}

export function suggestionDuplicateLabel(
  result: ProposalDuplicateResult | undefined,
  check: DuplicateCheckBody | null,
  failed: boolean,
  pending: boolean
): { kind: "pending" | "unavailable" | "partial" | "none" | "badge"; text: string } {
  if (pending) {
    return { kind: "pending", text: "Vérification des doublons…" };
  }
  if (failed || !check || check.coverage === "unavailable" || check.verified === false) {
    if (result?.level === "exact" || result?.level === "similar") {
      return { kind: "badge", text: result.level };
    }
    return { kind: "unavailable", text: "Vérification indisponible." };
  }
  if (result?.level === "exact" || result?.level === "similar") {
    return { kind: "badge", text: result.level };
  }
  if (check.coverage === "partial") {
    return { kind: "partial", text: "Vérification partielle." };
  }
  return { kind: "none", text: "Aucun rapprochement détecté." };
}

function DuplicateLevelBadge({ level }: { level: DuplicateLevel }) {
  if (level === "exact") {
    return (
      <span className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800">
        Doublon exact
      </span>
    );
  }
  if (level === "similar") {
    return (
      <span className="inline-flex items-center rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-800">
        Sujet proche
      </span>
    );
  }
  return null;
}

function MatchPanel({
  matches,
  coverageUnavailable,
}: {
  matches: DuplicateMatch[];
  coverageUnavailable: boolean;
}) {
  if (matches.length === 0) {
    return null;
  }
  return (
    <span className="mt-2 block rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
      {coverageUnavailable ? (
        <span className="mb-1.5 block text-[11px] text-slate-500">
          Vérification WordPress indisponible.
        </span>
      ) : null}
      <span className="space-y-2">
        {matches.map((match) => (
          <span key={`${match.source}-${match.title}`} className="block">
            <span className="font-medium text-slate-800">
              {SUGGESTION_SOURCE_LABELS[match.source]}
            </span>
            {" · "}
            {match.url ? (
              <a
                href={match.url}
                target="_blank"
                rel="noreferrer"
                className="text-naxialis underline-offset-2 hover:underline"
              >
                {match.title}
              </a>
            ) : (
              <span className="break-words">{match.title}</span>
            )}
            <span className="mt-0.5 block break-words text-slate-500">{match.explanation}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

export function VeilleSuggestionDialog({
  article,
  theme,
  request,
  onRetry,
  onClose,
  onSelect,
}: {
  article: VeilleArticle;
  theme: string;
  request: Promise<{ ok: true; suggestions: SeoSuggestion[] } | { ok: false; message: string }>;
  onRetry: () => void;
  onClose: () => void;
  onSelect: (suggestion: SeoSuggestion) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [selected, setSelected] = useState(0);
  const [duplicates, setDuplicates] = useState<DuplicateCheckBody | null>(null);
  const [duplicatesFailed, setDuplicatesFailed] = useState(false);
  const [duplicatesPending, setDuplicatesPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhase({ status: "loading" });
    void request
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setPhase({ status: "error", message: result.message });
          return;
        }
        setSelected(0);
        setDuplicates(null);
        setDuplicatesFailed(false);
        setDuplicatesPending(true);
        setPhase({ status: "ready", suggestions: result.suggestions });
        void fetch("/api/topics/check-duplicates", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposals: result.suggestions.map((suggestion) => ({
              title: suggestion.title,
              angle: suggestion.angle,
              intent: suggestion.intent,
            })),
          }),
        })
          .then(async (response) => {
            const payload = (await response.json()) as DuplicateCheckBody;
            if (cancelled) {
              return;
            }
            if (!response.ok || !payload.results) {
              setDuplicatesFailed(true);
              setDuplicatesPending(false);
              return;
            }
            setDuplicates(payload);
            setDuplicatesPending(false);
          })
          .catch(() => {
            if (!cancelled) {
              setDuplicatesFailed(true);
              setDuplicatesPending(false);
            }
          });
      })
      .catch(() => {
        if (!cancelled) {
          setPhase({
            status: "error",
            message: "Les suggestions n’ont pas pu être préparées.",
          });
        }
      });
    dialogRef.current?.focus();
    return () => {
      cancelled = true;
    };
  }, [request]);

  const loading = phase.status === "loading";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="veille-suggestions-title"
        aria-busy={loading}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 outline-none"
      >
        <h2 id="veille-suggestions-title" className="text-lg font-semibold text-slate-900">
          Suggérer 3 sujets SEO
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Suggestions éditoriales à partir de la publication. Aucune génération n’est lancée
          et aucun sujet n’est enregistré tant que vous ne le confirmez pas.
        </p>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <p className="font-medium break-words text-slate-900">{article.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {article.sourceName}
            {" · "}
            {theme}
          </p>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Préparation de trois suggestions…</p>
        ) : null}

        {phase.status === "error" ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {phase.message}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
            >
              Réessayer
            </button>
          </div>
        ) : null}

        {phase.status === "ready" ? (
          <fieldset className="mt-4 space-y-3" disabled={loading}>
            <legend className="text-sm font-medium text-slate-800">
              Choisissez une proposition
            </legend>
            {phase.suggestions.map((suggestion, index) => {
              const id = `veille-suggestion-${index}`;
              const active = selected === index;
              const result = duplicates?.results[index];
              const status = suggestionDuplicateLabel(
                result,
                duplicates,
                duplicatesFailed,
                duplicatesPending
              );
              const coverageUnavailable =
                duplicatesFailed ||
                !duplicates ||
                duplicates.coverage === "unavailable" ||
                duplicates.verified === false;
              return (
                <label
                  key={suggestion.title}
                  htmlFor={id}
                  className={`block cursor-pointer rounded-lg border px-3 py-3 ${
                    active ? "border-naxialis bg-slate-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      id={id}
                      type="radio"
                      name="veille-suggestion"
                      className="mt-1"
                      checked={active}
                      onChange={() => setSelected(index)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold break-words text-slate-900">
                        {suggestion.title}
                      </span>
                      <span className="mt-1 block text-sm break-words text-slate-700">
                        {suggestion.angle}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                          {FORMAT_LABELS[suggestion.format] ?? suggestion.format}
                        </span>
                        <span className="break-words">{suggestion.intent}</span>
                      </span>
                      <span className="mt-2 block text-xs break-words text-slate-500">
                        {suggestion.rationale}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        {status.kind === "badge" ? (
                          <DuplicateLevelBadge level={status.text as DuplicateLevel} />
                        ) : (
                          <span
                            className={`text-xs font-medium ${
                              status.kind === "partial" || status.kind === "unavailable"
                                ? "text-slate-500"
                                : "text-slate-700"
                            }`}
                          >
                            {status.text}
                          </span>
                        )}
                      </span>
                      <MatchPanel
                        matches={result?.matches ?? []}
                        coverageUnavailable={
                          coverageUnavailable && (result?.matches.length ?? 0) > 0
                        }
                      />
                    </span>
                  </span>
                </label>
              );
            })}
            <p className="text-xs text-slate-500">
              Ces cartes sont des suggestions éditoriales. Elles ne mesurent ni un volume de
              recherche ni une opportunité SEO validée.
            </p>
          </fieldset>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          {phase.status === "ready" ? (
            <button
              type="button"
              onClick={() => onSelect(phase.suggestions[selected])}
              className="rounded-md bg-naxialis px-4 py-2 text-sm font-medium text-white hover:bg-naxialis-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
            >
              Utiliser ce sujet
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
