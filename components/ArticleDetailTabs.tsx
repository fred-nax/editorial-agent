"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ARTICLE_DETAIL_TABS,
  moveArticleDetailTab,
  type ArticleDetailTabId,
} from "@/lib/article-detail-tabs";

export function ArticleDetailTabs({
  report,
  article,
  usage,
}: {
  report: ReactNode;
  article: ReactNode;
  usage: ReactNode;
}) {
  const [active, setActive] = useState<ArticleDetailTabId>("report");
  const tabRefs = useRef<Partial<Record<ArticleDetailTabId, HTMLButtonElement | null>>>({});
  const panels = { report, article, usage };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = moveArticleDetailTab(active, event.key);
    if (next === active) {
      return;
    }
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="min-w-0">
      <div
        role="tablist"
        aria-label="Détail de la génération"
        className="flex gap-1 overflow-x-auto border-b border-slate-200"
        onKeyDown={onKeyDown}
      >
        {ARTICLE_DETAIL_TABS.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`generation-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`generation-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis ${
                selected
                  ? "border-naxialis text-naxialis"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {ARTICLE_DETAIL_TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`generation-panel-${tab.id}`}
          aria-labelledby={`generation-tab-${tab.id}`}
          hidden={active !== tab.id}
          className="min-w-0 pt-4"
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
