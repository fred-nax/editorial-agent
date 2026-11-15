"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
export type VeilleSearchLoadingProps = {
  theme: string;
  countryLabel: string;
  periodDays: number;
};

export {
  useSearchLoadingProgress,
  useVeilleSearchProgress,
} from "@/components/SearchLoadingOverlay";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Contenu centré de l’overlay de chargement (sans panneau Card). */
export function VeilleSearchLoading({
  theme,
  countryLabel,
  periodDays,
  estimatePct,
  elapsedSec,
}: VeilleSearchLoadingProps & {
  estimatePct: number;
  elapsedSec: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const pctLabel = Math.min(100, Math.max(0, estimatePct));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="w-full max-w-md px-6 py-8 text-center"
    >
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center">
        {reducedMotion ? (
          <span className="inline-flex size-16 items-center justify-center rounded-full border border-[#E2E8F0] bg-white/90 text-[#0F5270] shadow-sm">
            <Search className="size-7" aria-hidden />
          </span>
        ) : (
          <img
            src="/search.svg"
            alt=""
            width={80}
            height={80}
            decoding="async"
            draggable={false}
            className="pointer-events-none mx-auto h-20 w-20 border-0 bg-transparent object-contain shadow-none outline-none"
            aria-hidden="true"
          />
        )}
      </div>

      <p className="text-sm font-semibold text-slate-900">
        Recherche d&apos;actualités en cours…
      </p>
      <p className="mt-1.5 text-sm break-words text-slate-600">
        <span className="font-medium text-slate-800">{theme}</span>
        {" · "}
        {countryLabel}
        {" · "}
        {periodDays} jours
      </p>

      <div className="mx-auto mt-5 w-full space-y-2">
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-200/80"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-naxialis transition-[width] duration-300 ease-out"
            style={{ width: `${pctLabel}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Estimation {pctLabel}&nbsp;%
            <span className="sr-only">
              {" "}
              (progression indicative, non fournie par le serveur)
            </span>
          </span>
          <span>
            {elapsedSec < 2
              ? "Temps écoulé : moins d’une seconde"
              : `Temps écoulé : ${elapsedSec} s`}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Le pourcentage est une estimation visuelle.
        </p>
      </div>
    </div>
  );
}
