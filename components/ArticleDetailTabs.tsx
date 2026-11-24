"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Image, LineChart } from "lucide-react";
import {
  ARTICLE_DETAIL_TABS,
  getArticleDetailTabs,
  moveArticleDetailTab,
  type ArticleDetailTabId,
} from "@/lib/article-detail-tabs";

export function ArticleDetailTabs({
  report,
  article,
  usage,
  featured,
  performances,
  initialTab = "report",
  cmsDestination,
}: {
  report: ReactNode;
  article: ReactNode;
  usage: ReactNode;
  featured?: ReactNode;
  performances?: ReactNode;
  initialTab?: ArticleDetailTabId;
  cmsDestination?: string | null;
}) {
  const tabs = useMemo(
    () => getArticleDetailTabs(cmsDestination),
    [cmsDestination]
  );
  const panels: Partial<Record<ArticleDetailTabId, ReactNode>> = {
    report,
    article,
    usage,
    featured,
    performances,
  };

  const resolvedInitial =
    tabs.some((tab) => tab.id === initialTab) ? initialTab : tabs[0]!.id;

  const [active, setActive] = useState<ArticleDetailTabId>(resolvedInitial);
  const tabRefs = useRef<Partial<Record<ArticleDetailTabId, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === active)) {
      setActive(tabs[0]!.id);
    }
  }, [active, tabs]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = moveArticleDetailTab(active, event.key, tabs);
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
        {tabs.map((tab) => {
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
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis ${
                selected
                  ? "border-naxialis text-naxialis"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setActive(tab.id)}
            >
              {tab.id === "featured" ? (
                <Image className="size-3.5 shrink-0" aria-hidden />
              ) : null}
              {tab.id === "performances" ? (
                <LineChart className="size-3.5 shrink-0" aria-hidden />
              ) : null}
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
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
      {/* Conserve la référence catalogue pour les tests de non-régression WP. */}
      <span className="sr-only" data-all-tabs={ARTICLE_DETAIL_TABS.length} />
    </div>
  );
}
