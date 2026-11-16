"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { PropertyDailyPoint } from "@/lib/google/dashboard-presentation";

function fmtDate(iso: string, compact = false): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (compact) {
    return d.toLocaleDateString("fr-FR", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
    });
  }
  return d.toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/** Découpe une série en polylines continues (les null cassent le trait). */
export function buildLineSegments(
  points: Array<{ x: number; y: number | null }>
): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (current.length >= 2) {
        segments.push(current.join(" "));
      }
      current = [];
      continue;
    }
    current.push(`${point.x},${point.y}`);
  }
  if (current.length >= 2) {
    segments.push(current.join(" "));
  }
  return segments;
}

/** Position horizontale de l’infobulle (0–100), ancrée sur le point actif. */
export function tooltipAnchorPercent(index: number, total: number): number {
  if (total <= 1) {
    return 50;
  }
  return (index / (total - 1)) * 100;
}

/**
 * Évite que l’infobulle dépasse les bords : ancrage gauche / centre / droite.
 */
export function clampTooltipPlacement(percent: number): {
  left: string;
  transform: string;
} {
  if (percent <= 18) {
    return { left: "0%", transform: "translateX(0)" };
  }
  if (percent >= 82) {
    return { left: "100%", transform: "translateX(-100%)" };
  }
  return { left: `${percent}%`, transform: "translateX(-50%)" };
}

export function SeoPropertyTrendChart({
  series,
  periodStart,
  periodEnd,
}: {
  series: PropertyDailyPoint[];
  periodStart: string | null;
  periodEnd: string | null;
}) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [compactLabels, setCompactLabels] = useState(false);

  const width = 1000;
  const height = 248;
  const pad = { top: 20, right: 48, bottom: 34, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }
    const update = () => setCompactLabels(node.clientWidth < 520);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    const clicks = series
      .map((p) => p.clicks)
      .filter((v): v is number => v !== null);
    const impressions = series
      .map((p) => p.impressions)
      .filter((v): v is number => v !== null);
    const maxClicks = Math.max(0, ...clicks, 1);
    const maxImpr = Math.max(0, ...impressions, 1);
    const n = Math.max(series.length, 1);
    const xAt = (i: number) =>
      pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yClicks = (v: number) =>
      pad.top + plotH - (v / maxClicks) * plotH;
    const yImpr = (v: number) =>
      pad.top + plotH - (v / maxImpr) * plotH;

    const clickPts = series.map((p, i) => ({
      x: xAt(i),
      y: p.clicks === null ? null : yClicks(p.clicks),
    }));
    const imprPts = series.map((p, i) => ({
      x: xAt(i),
      y: p.impressions === null ? null : yImpr(p.impressions),
    }));

    return {
      maxClicks,
      maxImpr,
      xAt,
      clickSegments: buildLineSegments(clickPts),
      imprSegments: buildLineSegments(imprPts),
      clickPts,
      imprPts,
    };
  }, [series, pad.left, pad.top, plotH, plotW]);

  const clearSelection = useCallback(() => {
    setActiveIndex(null);
    setPinned(false);
  }, []);

  const selectIndex = useCallback((index: number, pin: boolean) => {
    setActiveIndex(index);
    setPinned(pin);
  }, []);

  useEffect(() => {
    if (!pinned) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        clearSelection();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pinned, clearSelection]);

  const onChartKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (series.length === 0) {
        return;
      }
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const current = activeIndex ?? (delta > 0 ? -1 : series.length);
        const next = Math.min(
          series.length - 1,
          Math.max(0, current + delta)
        );
        selectIndex(next, true);
      }
    },
    [activeIndex, clearSelection, selectIndex, series.length]
  );

  if (series.length === 0) {
    return (
      <p className="mt-4 text-sm text-slate-600">
        Pas encore de courbe propriété pour cette période.
      </p>
    );
  }

  const hasAnyData = series.some(
    (p) => p.clicks !== null || p.impressions !== null
  );
  if (!hasAnyData) {
    return (
      <p className="mt-4 text-sm text-slate-600">
        Aucun jour consolidé sur {periodStart ?? "—"} → {periodEnd ?? "—"}.
      </p>
    );
  }

  const active = activeIndex !== null ? series[activeIndex] : null;
  const tickIndexes = compactLabels
    ? [0, series.length - 1].filter((v, i, arr) => arr.indexOf(v) === i)
    : [0, Math.floor((series.length - 1) / 2), series.length - 1].filter(
        (v, i, arr) => arr.indexOf(v) === i && v >= 0
      );

  const tooltipStyle =
    activeIndex !== null
      ? clampTooltipPlacement(
          tooltipAnchorPercent(activeIndex, series.length)
        )
      : null;

  return (
    <div className="mt-5 w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Évolution propriété
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-naxialis" aria-hidden />
            Clics (éch. g.)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-slate-400" aria-hidden />
            Impressions (éch. d.)
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full outline-none focus-visible:ring-2 focus-visible:ring-naxialis/30 focus-visible:ring-offset-2"
        tabIndex={0}
        role="group"
        aria-label="Graphique Search Console. Utilisez les flèches gauche et droite pour parcourir les jours, Échap pour fermer."
        aria-describedby={listId}
        onKeyDown={onChartKeyDown}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-[220px] w-full sm:h-[240px] lg:h-[256px]"
          preserveAspectRatio="none"
          role="img"
          aria-hidden
        >
          {[0, 0.5, 1].map((t) => {
            const y = pad.top + plotH * (1 - t);
            return (
              <line
                key={t}
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="1"
              />
            );
          })}

          {layout.imprSegments.map((points, i) => (
            <polyline
              key={`impr-${i}`}
              fill="none"
              stroke="#94A3B8"
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points}
            />
          ))}
          {layout.clickSegments.map((points, i) => (
            <polyline
              key={`clicks-${i}`}
              fill="none"
              stroke="#0F5270"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points}
            />
          ))}

          {series.map((point, i) => {
            const cx = layout.xAt(i);
            const isActive = activeIndex === i;
            return (
              <g key={point.date}>
                {point.impressions !== null && layout.imprPts[i]?.y !== null ? (
                  <circle
                    cx={cx}
                    cy={layout.imprPts[i]!.y!}
                    r={isActive ? 4 : 2.5}
                    fill="#94A3B8"
                  />
                ) : null}
                {point.clicks !== null && layout.clickPts[i]?.y !== null ? (
                  <circle
                    cx={cx}
                    cy={layout.clickPts[i]!.y!}
                    r={isActive ? 4 : 2.5}
                    fill="#0F5270"
                  />
                ) : null}
              </g>
            );
          })}

          <text
            x={pad.left}
            y={pad.top - 6}
            className="fill-slate-500"
            fontSize="11"
            textAnchor="start"
          >
            {fmtNum(layout.maxClicks)}
          </text>
          <text
            x={pad.left}
            y={pad.top + plotH + 4}
            className="fill-slate-500"
            fontSize="11"
            textAnchor="start"
            dominantBaseline="hanging"
          >
            0
          </text>
          <text
            x={width - pad.right}
            y={pad.top - 6}
            className="fill-slate-500"
            fontSize="11"
            textAnchor="end"
          >
            {fmtNum(layout.maxImpr)}
          </text>
          <text
            x={width - pad.right}
            y={pad.top + plotH + 4}
            className="fill-slate-500"
            fontSize="11"
            textAnchor="end"
            dominantBaseline="hanging"
          >
            0
          </text>

          {tickIndexes.map((i) => (
            <text
              key={series[i]?.date ?? i}
              x={layout.xAt(i)}
              y={height - 8}
              className="fill-slate-500"
              fontSize={compactLabels ? 10 : 11}
              textAnchor={
                i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"
              }
            >
              {series[i]
                ? fmtDate(series[i].date, compactLabels)
                : ""}
            </text>
          ))}

          {series.map((point, i) => {
            const x = layout.xAt(i);
            const half =
              series.length > 1 ? plotW / (series.length - 1) / 2 : plotW / 2;
            return (
              <rect
                key={`hit-${point.date}`}
                x={x - half}
                y={pad.top}
                width={Math.max(half * 2, 10)}
                height={plotH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => {
                  if (!pinned) {
                    setActiveIndex(i);
                  }
                }}
                onMouseLeave={() => {
                  if (!pinned) {
                    setActiveIndex(null);
                  }
                }}
                onPointerDown={(event) => {
                  // Tactile / stylet : épingle l’infobulle jusqu’au prochain tap extérieur.
                  if (event.pointerType !== "mouse") {
                    event.preventDefault();
                    selectIndex(i, true);
                  }
                }}
                onClick={() => {
                  if (pinned && activeIndex === i) {
                    clearSelection();
                  } else {
                    selectIndex(i, true);
                  }
                }}
              >
                <title>{tooltipLabel(point)}</title>
              </rect>
            );
          })}

          {activeIndex !== null ? (
            <line
              x1={layout.xAt(activeIndex)}
              x2={layout.xAt(activeIndex)}
              y1={pad.top}
              y2={pad.top + plotH}
              stroke="#CBD5E1"
              strokeWidth="1.25"
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          ) : null}
        </svg>

        <p id={listId} className="sr-only">
          {series.length} jours de {periodStart ?? "—"} à {periodEnd ?? "—"}.
        </p>

        {active && tooltipStyle ? (
          <div
            className="pointer-events-none absolute top-2 z-10 max-w-[min(100%,17rem)] rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur-sm"
            style={{
              left: tooltipStyle.left,
              transform: tooltipStyle.transform,
            }}
            role="tooltip"
          >
            <p className="font-medium text-slate-900">
              {fmtDate(active.date, false)}
            </p>
            <p className="mt-1">
              Clics :{" "}
              <span className="font-medium text-naxialis">
                {active.clicks === null
                  ? "non disponible"
                  : fmtNum(active.clicks)}
              </span>
            </p>
            <p>
              Impressions :{" "}
              <span className="font-medium text-slate-800">
                {active.impressions === null
                  ? "non disponible"
                  : fmtNum(active.impressions)}
              </span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function tooltipLabel(point: PropertyDailyPoint): string {
  const date = fmtDate(point.date, false);
  const clicks =
    point.clicks === null
      ? "clics non disponibles"
      : `${fmtNum(point.clicks)} clics`;
  const impressions =
    point.impressions === null
      ? "impressions non disponibles"
      : `${fmtNum(point.impressions)} impressions`;
  return `${date} — ${clicks}, ${impressions}`;
}
