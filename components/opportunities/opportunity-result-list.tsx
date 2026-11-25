"use client";

import { useRef } from "react";
import {
  formatThemeLabel,
  hasDuplicateRisk,
  scoreTone,
  TREND_LABELS,
  URGENCY_LABELS,
  type SeoOpportunityItem,
} from "@/components/opportunities/opportunity-display";

type Props = {
  items: SeoOpportunityItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function OpportunityResultList({
  items,
  selectedId,
  onSelect,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);

  function focusItem(id: string) {
    const root = listRef.current;
    if (!root) {
      return;
    }
    const node = root.querySelector<HTMLElement>(
      `[data-opportunity-id="${id.replace(/"/g, "")}"]`
    );
    node?.focus();
  }

  function moveSelection(delta: number) {
    if (items.length === 0) {
      return;
    }
    const currentIndex = selectedId
      ? items.findIndex((item) => item.id === selectedId)
      : -1;
    const nextIndex =
      currentIndex < 0
        ? delta > 0
          ? 0
          : items.length - 1
        : Math.min(items.length - 1, Math.max(0, currentIndex + delta));
    const next = items[nextIndex];
    if (!next) {
      return;
    }
    onSelect(next.id);
    focusItem(next.id);
  }

  if (items.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-slate-500">
        Aucune opportunité pour ces filtres. Synchronisez puis lancez une
        recherche.
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Liste des opportunités SEO"
      className="divide-y divide-slate-100"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveSelection(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveSelection(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          const first = items[0];
          if (first) {
            onSelect(first.id);
            focusItem(first.id);
          }
        } else if (event.key === "End") {
          event.preventDefault();
          const last = items[items.length - 1];
          if (last) {
            onSelect(last.id);
            focusItem(last.id);
          }
        }
      }}
    >
      {items.map((item) => {
        const selected = selectedId === item.id;
        const duplicate = hasDuplicateRisk(item.duplicateRisk);

        return (
          <button
            key={item.id}
            type="button"
            role="option"
            data-opportunity-id={item.id}
            aria-selected={selected}
            tabIndex={selected || (!selectedId && item.id === items[0]?.id) ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onFocus={() => {
              if (selectedId !== item.id) {
                onSelect(item.id);
              }
            }}
            className={`w-full px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F5270]/35 ${
              selected
                ? "border-l-[3px] border-l-[#0F5270] bg-[#0F5270]/[0.06]"
                : "border-l-[3px] border-l-transparent hover:bg-slate-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${scoreTone(item.scoreTotal)}`}
                aria-label={`Score éditorial ${item.scoreTotal} sur 100`}
              >
                {item.scoreTotal}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-slate-900 break-words whitespace-normal">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatThemeLabel(item.theme)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {item.trendType ? (
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-900">
                      {TREND_LABELS[item.trendType]}
                      {item.trendScore != null ? ` · ${item.trendScore}` : ""}
                    </span>
                  ) : null}
                  {item.editorialUrgency ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900">
                      Urgence {URGENCY_LABELS[item.editorialUrgency]}
                    </span>
                  ) : null}
                  {duplicate ? (
                    <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-800">
                      Risque doublon : {item.duplicateRisk}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
