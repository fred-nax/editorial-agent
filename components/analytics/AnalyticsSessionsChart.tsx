"use client";

import { useMemo, useState } from "react";
import {
  buildLineSegments,
  clampTooltipPlacement,
  tooltipAnchorPercent,
} from "@/components/dashboard/SeoPropertyTrendChart";

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

/** Courbe mono-série (sessions IA) — jours sans données = null, pas de zéro fictif. */
export function AnalyticsSessionsChart({
  series,
}: {
  series: Array<{ date: string; value: number | null }>;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 1000;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 30, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const layout = useMemo(() => {
    const values = series
      .map((p) => p.value)
      .filter((v): v is number => v !== null);
    const max = Math.max(0, ...values, 1);
    const n = Math.max(series.length, 1);
    const xAt = (i: number) =>
      pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v: number) => pad.top + plotH - (v / max) * plotH;
    const pts = series.map((p, i) => ({
      x: xAt(i),
      y: p.value === null ? null : yAt(p.value),
    }));
    return { max, xAt, pts, segments: buildLineSegments(pts) };
  }, [series, pad.left, pad.top, plotH, plotW]);

  if (series.length === 0 || !series.some((p) => p.value !== null)) {
    return (
      <p className="text-sm text-slate-600">Aucune session IA sur la période.</p>
    );
  }

  const active = activeIndex !== null ? series[activeIndex] : null;
  const tooltipStyle =
    activeIndex !== null
      ? clampTooltipPlacement(tooltipAnchorPercent(activeIndex, series.length))
      : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-[200px] w-full sm:h-[220px]"
        preserveAspectRatio="none"
        role="img"
        aria-label="Évolution des sessions IA identifiables"
      >
        {layout.segments.map((points, i) => (
          <polyline
            key={i}
            fill="none"
            stroke="#0F5270"
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
        ))}
        {series.map((point, i) =>
          point.value !== null && layout.pts[i]?.y !== null ? (
            <circle
              key={point.date}
              cx={layout.xAt(i)}
              cy={layout.pts[i]!.y!}
              r={activeIndex === i ? 4 : 2.5}
              fill="#0F5270"
            />
          ) : null
        )}
        <text
          x={pad.left}
          y={pad.top - 4}
          className="fill-slate-500"
          fontSize="11"
        >
          {fmtNum(layout.max)}
        </text>
        {[0, series.length - 1].map((i) => (
          <text
            key={series[i]?.date ?? i}
            x={layout.xAt(i)}
            y={height - 8}
            className="fill-slate-500"
            fontSize="11"
            textAnchor={i === 0 ? "start" : "end"}
          >
            {series[i] ? fmtDate(series[i].date) : ""}
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
              width={Math.max(half * 2, 8)}
              height={plotH}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
              tabIndex={0}
            />
          );
        })}
      </svg>
      {active && tooltipStyle ? (
        <div
          className="pointer-events-none absolute top-2 z-10 max-w-[min(100%,14rem)] rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: tooltipStyle.left, transform: tooltipStyle.transform }}
          role="tooltip"
        >
          <p className="font-medium text-slate-900">{fmtDate(active.date)}</p>
          <p>
            Sessions IA :{" "}
            {active.value === null ? "non disponible" : fmtNum(active.value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
