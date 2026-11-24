import Link from "next/link";

export type HistoryCmsFilter = "all" | "wordpress" | "webflow";

const FILTERS: Array<{ id: HistoryCmsFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "wordpress", label: "WordPress" },
  { id: "webflow", label: "Webflow" },
];

export function parseHistoryCmsFilter(value: unknown): HistoryCmsFilter {
  if (value === "wordpress" || value === "webflow") {
    return value;
  }
  return "all";
}

export function ArticleHistoryFilters({
  current,
}: {
  current: HistoryCmsFilter;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Filtrer par destination CMS"
    >
      {FILTERS.map((filter) => {
        const selected = current === filter.id;
        const href =
          filter.id === "all" ? "/articles" : `/articles?cms=${filter.id}`;
        return (
          <Link
            key={filter.id}
            href={href}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selected
                ? "border-naxialis bg-naxialis text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
            aria-current={selected ? "page" : undefined}
          >
            {filter.label}
          </Link>
        );
      })}
    </div>
  );
}
