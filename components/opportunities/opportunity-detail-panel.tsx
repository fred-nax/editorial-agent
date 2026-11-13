"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  asSimilarPosts,
  asSimilarTopics,
  asSources,
  CONFIDENCE_LABELS,
  CONTENT_LABELS,
  formatThemeLabel,
  hasDuplicateRisk,
  scoreTone,
  TREND_LABELS,
  URGENCY_LABELS,
  type SeoOpportunityItem,
  type SourceQualification,
} from "@/components/opportunities/opportunity-display";

type Props = {
  opportunity: SeoOpportunityItem | null;
  pendingId: string | null;
  onQueue: (id: string) => void;
  onDismiss: (id: string) => void;
  /** Affiche un bouton fermer (mobile / sheet). */
  onClose?: () => void;
  emptyHint?: string;
};

function QualifiedSourceList({
  items,
  emptyLabel,
}: {
  items: SourceQualification[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="mt-1 text-xs text-slate-500">{emptyLabel}</p>;
  }
  return (
    <ul className="mt-1.5 space-y-1.5">
      {items.map((source) => (
        <li key={`${source.role}-${source.url}-${source.title}`}>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-naxialis underline break-words"
          >
            {source.title}
            {source.date ? ` (${source.date})` : ""}
          </a>
          {source.exclusionReason ? (
            <p className="text-xs text-slate-500">{source.exclusionReason}</p>
          ) : null}
          {source.sharedInBatch ? (
            <p className="text-xs text-amber-700">
              Également citée sur d’autres opportunités du lot.
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function OpportunityDetailPanel({
  opportunity,
  pendingId,
  onQueue,
  onDismiss,
  onClose,
  emptyHint = "Sélectionnez une opportunité pour afficher l’angle, les sources, les sous-scores et les articles similaires.",
}: Props) {
  if (!opportunity) {
    return (
      <div className="flex h-full min-h-[12rem] items-center justify-center px-4 py-8">
        <p className="max-w-sm text-center text-sm text-slate-500">{emptyHint}</p>
      </div>
    );
  }

  const selected = opportunity;
  const similarPosts = asSimilarPosts(selected.similarPosts);
  const similarTopics = asSimilarTopics(selected.similarTopics);
  const qualifications = selected.trendSignals?.sourceQualifications ?? [];
  const legacySources = asSources(selected.sources);
  const evidence = qualifications.filter((item) => item.role === "trend_evidence");
  const documentary = qualifications.filter((item) => item.role === "documentary");
  const excluded = qualifications.filter((item) => item.role === "excluded");
  const duplicate = hasDuplicateRisk(selected.duplicateRisk);

  const subScores: Array<[string, number, string | undefined]> = [
    ["Pertinence", selected.scoreRelevance, selected.scoreRationale?.relevance],
    ["Commercial", selected.scoreCommercial, selected.scoreRationale?.commercial],
    ["Intention", selected.scoreIntent, selected.scoreRationale?.intent],
    ["Actualité", selected.scoreTimeliness, selected.scoreRationale?.timeliness],
    ["Originalité", selected.scoreOriginality, selected.scoreRationale?.originality],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        {onClose ? (
          <div className="flex justify-end lg:hidden">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5270]/30"
            >
              Fermer
            </button>
          </div>
        ) : null}

        {/* En-tête */}
        <header className="space-y-2">
          <span
            className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${scoreTone(selected.scoreTotal)}`}
          >
            Score éditorial {selected.scoreTotal}/100
          </span>
          <h2 className="text-lg font-semibold leading-snug text-slate-900 break-words">
            {selected.title}
          </h2>
          <p className="text-sm text-slate-600">
            {formatThemeLabel(selected.theme)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {CONTENT_LABELS[selected.contentType ?? "evergreen"]}
            </span>
            {selected.trendType ? (
              <span className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-900">
                Tendance : {TREND_LABELS[selected.trendType]}
                {selected.trendScore != null
                  ? ` · ${selected.trendScore}/100`
                  : ""}
              </span>
            ) : (
              <span className="rounded bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                Tendance non évaluée (historique)
              </span>
            )}
            {selected.editorialUrgency ? (
              <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                Urgence {URGENCY_LABELS[selected.editorialUrgency]}
              </span>
            ) : null}
            {duplicate ? (
              <span className="rounded bg-orange-50 px-2 py-0.5 text-xs text-orange-800">
                Doublon WP : {selected.duplicateRisk}
              </span>
            ) : (
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                Pas de doublon WP fort
              </span>
            )}
          </div>
          {selected.subject && selected.subject !== selected.title ? (
            <p className="text-sm text-slate-500">{selected.subject}</p>
          ) : null}
        </header>

        {/* Angle éditorial */}
        {selected.angle ? (
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Angle éditorial
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-800">
              {selected.angle}
            </p>
            {selected.searchIntent ? (
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Intention :</span>{" "}
                {selected.searchIntent}
              </p>
            ) : null}
          </section>
        ) : selected.searchIntent ? (
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Intention
            </h3>
            <p className="mt-1.5 text-sm text-slate-700">{selected.searchIntent}</p>
          </section>
        ) : null}

        {/* Justification */}
        {selected.rationale ? (
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Justification
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
              {selected.rationale}
            </p>
          </section>
        ) : null}

        {selected.trendJustification ? (
          <section className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Justification de tendance
              {selected.trendConfidence
                ? ` · confiance ${CONFIDENCE_LABELS[selected.trendConfidence]}`
                : ""}
              {selected.trendSignals?.analysisVersion
                ? ` · ${selected.trendSignals.analysisVersion}`
                : ""}
            </h3>
            <p className="mt-1.5 text-sm text-slate-700">
              {selected.trendJustification}
            </p>
            {selected.trendCheckedAt ? (
              <p className="mt-1 text-xs text-slate-500">
                Vérifié le{" "}
                {new Date(selected.trendCheckedAt).toLocaleString("fr-FR")}
              </p>
            ) : null}
            {selected.trendSignals?.historyComparison?.interpretation ? (
              <p className="mt-2 text-xs text-slate-600">
                Historique :{" "}
                {selected.trendSignals.historyComparison.interpretation}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Détail des scores (repliable) */}
        <details className="group rounded-md border border-slate-200 bg-white open:bg-slate-50/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F5270]/30 [&::-webkit-details-marker]:hidden">
            <span>Détail des scores</span>
            <ChevronDown
              className="size-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="grid gap-3 border-t border-slate-100 px-3 py-3 sm:grid-cols-2">
            {subScores.map(([label, value, tip]) => (
              <div key={label} className="text-xs text-slate-600">
                <p className="font-medium text-slate-800">
                  {label} · {value}
                </p>
                {tip ? (
                  <p className="mt-0.5 leading-snug text-slate-600">{tip}</p>
                ) : null}
              </div>
            ))}
          </div>
        </details>

        {/* Sources */}
        {qualifications.length > 0 || legacySources.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Sources
            </h3>
            {qualifications.length === 0 ? (
              <div>
                <p className="text-xs font-medium text-slate-600">
                  Sources (historique)
                </p>
                <ul className="mt-1.5 space-y-1">
                  {legacySources.map((source) => (
                    <li key={`${source.url}-${source.title}`}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-naxialis underline break-words"
                      >
                        {source.title}
                        {source.date ? ` (${source.date})` : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                    Preuves de tendance
                  </p>
                  <QualifiedSourceList
                    items={evidence}
                    emptyLabel="Aucune preuve directe retenue."
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Sources documentaires
                  </p>
                  <QualifiedSourceList
                    items={documentary}
                    emptyLabel="Aucune source documentaire."
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Sources exclues du calcul
                  </p>
                  <QualifiedSourceList
                    items={excluded}
                    emptyLabel="Aucune source exclue."
                  />
                </div>
              </div>
            )}
          </section>
        ) : null}

        {/* Articles / sujets similaires */}
        {similarPosts.length > 0 || similarTopics.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Articles et sujets similaires
            </h3>
            {similarPosts.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-slate-600">
                  Articles WP similaires
                </p>
                <ul className="mt-1.5 space-y-1.5 text-sm text-slate-700">
                  {similarPosts.map((post) => (
                    <li key={post.wpPostId}>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline break-words"
                      >
                        {post.title}
                      </a>
                      <span className="text-slate-500">
                        {" "}
                        · {Math.round(post.score * 100)} % — {post.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {similarTopics.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-slate-600">
                  Sujets déjà en file
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
                  {similarTopics.map((topic) => (
                    <li key={topic.topicId}>
                      {topic.subject}
                      <span className="text-slate-500">
                        {" "}
                        · {Math.round(topic.score * 100)} %
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              pendingId === selected.id || selected.status === "added_to_queue"
            }
            onClick={() => onQueue(selected.id)}
            className="rounded-md bg-naxialis-dark px-3 py-2 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#0F5270]/40 disabled:opacity-50"
          >
            {selected.status === "added_to_queue"
              ? "Déjà en file"
              : pendingId === selected.id
                ? "Ajout…"
                : "Ajouter à la file de sujets"}
          </button>
          {selected.status !== "dismissed" &&
          selected.status !== "added_to_queue" ? (
            <button
              type="button"
              disabled={pendingId === selected.id}
              onClick={() => onDismiss(selected.id)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 disabled:opacity-50"
            >
              Écarter
            </button>
          ) : null}
          {selected.topicId ? (
            <Link
              href="/topics"
              className="self-center text-xs text-naxialis underline outline-none focus-visible:ring-2 focus-visible:ring-[#0F5270]/30"
            >
              Voir la file
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
