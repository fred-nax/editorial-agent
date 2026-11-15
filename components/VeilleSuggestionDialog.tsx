"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SeoSuggestion } from "@/lib/veille/suggestions";
import type {
  DuplicateCheckBody,
  DuplicateLevel,
  DuplicateMatch,
  DuplicateSource,
  ProposalDuplicateResult,
} from "@/lib/veille/editorial-duplicates";
import type { VeilleArticle } from "@/lib/veille/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

const SHORT_DESCRIPTION_CHARS = 140;

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

function shortDescription(value: string): string {
  const cleaned = value.trim();
  if (cleaned.length <= SHORT_DESCRIPTION_CHARS) {
    return cleaned;
  }
  return `${cleaned.slice(0, SHORT_DESCRIPTION_CHARS).trimEnd()}…`;
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

function SuggestionCard({
  suggestion,
  index,
  selected,
  onSelect,
  result,
  duplicates,
  duplicatesFailed,
  duplicatesPending,
}: {
  suggestion: SeoSuggestion;
  index: number;
  selected: boolean;
  onSelect: () => void;
  result: ProposalDuplicateResult | undefined;
  duplicates: DuplicateCheckBody | null;
  duplicatesFailed: boolean;
  duplicatesPending: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const id = `veille-suggestion-${index}`;
  const detailsId = `${id}-details`;
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
    <div
      className={`rounded-lg border transition-colors ${
        selected
          ? "border-naxialis bg-slate-50 ring-1 ring-naxialis/20"
          : "border-[#E2E8F0] bg-white hover:border-slate-300"
      }`}
    >
      <label htmlFor={id} className="flex cursor-pointer gap-3 p-3 sm:p-3.5">
        <input
          id={id}
          type="radio"
          name="veille-suggestion"
          className="mt-1 size-4 shrink-0 accent-[#0F5270]"
          checked={selected}
          onChange={onSelect}
        />
        <span className="min-w-0 flex-1 space-y-2">
          <span className="block text-sm font-semibold leading-snug break-words text-[#0F172A]">
            {suggestion.title}
          </span>
          <span className="block text-sm leading-relaxed break-words text-slate-600">
            {shortDescription(suggestion.rationale)}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="border-[#E2E8F0] bg-white text-slate-700"
            >
              {FORMAT_LABELS[suggestion.format] ?? suggestion.format}
            </Badge>
            {status.kind === "badge" ? (
              <DuplicateLevelBadge level={status.text as DuplicateLevel} />
            ) : status.kind === "pending" ||
              status.kind === "partial" ||
              status.kind === "unavailable" ? (
              <span className="text-xs font-medium text-slate-500">{status.text}</span>
            ) : null}
          </span>
        </span>
      </label>

      <div className="border-t border-[#E2E8F0] px-3 pb-3 sm:px-3.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7 gap-1 px-2 text-xs text-slate-600"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDetailsOpen((value) => !value);
          }}
        >
          {detailsOpen ? (
            <>
              <ChevronUp className="size-3.5" aria-hidden />
              Masquer les détails
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" aria-hidden />
              Voir les détails
            </>
          )}
        </Button>

        {detailsOpen ? (
          <div id={detailsId} className="mt-2 space-y-2.5 text-sm text-slate-700">
            <p className="break-words">
              <span className="font-medium text-slate-900">Intention de recherche : </span>
              {suggestion.intent}
            </p>
            <p className="break-words">
              <span className="font-medium text-slate-900">Angle éditorial : </span>
              {suggestion.angle}
            </p>
            <p className="break-words">
              <span className="font-medium text-slate-900">Bénéfice pour le lecteur : </span>
              {suggestion.rationale}
            </p>
            <div className="space-y-1.5">
              <p className="font-medium text-slate-900">Niveau de vérification</p>
              {status.kind === "badge" ? (
                <DuplicateLevelBadge level={status.text as DuplicateLevel} />
              ) : (
                <p
                  className={`text-xs font-medium ${
                    status.kind === "partial" || status.kind === "unavailable"
                      ? "text-slate-500"
                      : "text-slate-700"
                  }`}
                >
                  {status.text}
                </p>
              )}
              <MatchPanel
                matches={result?.matches ?? []}
                coverageUnavailable={
                  coverageUnavailable && (result?.matches.length ?? 0) > 0
                }
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
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
    return () => {
      cancelled = true;
    };
  }, [request]);

  const loading = phase.status === "loading";

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full"
        aria-busy={loading}
      >
        <DialogHeader className="shrink-0 space-y-3 border-b border-[#E2E8F0] px-4 py-4 sm:px-5">
          <div className="space-y-1 pr-8">
            <DialogTitle id="veille-suggestions-title">
              Suggérer 3 sujets SEO
            </DialogTitle>
            <DialogDescription>
              Suggestions éditoriales à partir de la publication. Aucune génération n’est
              lancée et aucun sujet n’est enregistré tant que vous ne le confirmez pas.
            </DialogDescription>
          </div>
          <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-slate-700">
            <p className="font-medium break-words text-slate-900">{article.title}</p>
            <p className="mt-1 text-xs break-words text-slate-500">
              {article.sourceName}
              {" · "}
              {theme}
            </p>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <p className="text-sm text-slate-600">Préparation de trois suggestions…</p>
          ) : null}

          {phase.status === "error" ? (
            <div className="space-y-3">
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {phase.message}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="h-8 border-[#E2E8F0] text-slate-700"
              >
                Réessayer
              </Button>
            </div>
          ) : null}

          {phase.status === "ready" ? (
            <fieldset className="space-y-3" disabled={loading}>
              <legend className="text-sm font-medium text-slate-800">
                Choisissez une proposition
              </legend>
              {phase.suggestions.map((suggestion, index) => (
                <SuggestionCard
                  key={`${suggestion.title}-${index}`}
                  suggestion={suggestion}
                  index={index}
                  selected={selected === index}
                  onSelect={() => setSelected(index)}
                  result={duplicates?.results[index]}
                  duplicates={duplicates}
                  duplicatesFailed={duplicatesFailed}
                  duplicatesPending={duplicatesPending}
                />
              ))}
              <p className="text-xs text-slate-500">
                Ces cartes sont des suggestions éditoriales. Elles ne mesurent ni un volume
                de recherche ni une opportunité SEO validée.
              </p>
            </fieldset>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 flex-row flex-wrap gap-2 border-t border-[#E2E8F0] bg-white px-4 py-3 sm:px-5">
          {phase.status === "ready" ? (
            <Button
              type="button"
              onClick={() => onSelect(phase.suggestions[selected])}
              className="h-9 bg-naxialis text-white hover:bg-naxialis-dark"
            >
              Utiliser ce sujet
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-9 border-[#E2E8F0] text-slate-700"
          >
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
