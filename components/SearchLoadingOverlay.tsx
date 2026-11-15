"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const ESTIMATE_CAP = 95;
/** Constante de temps (ms) pour l’approche asymptotique vers le plafond. */
const ESTIMATE_TAU_MS = 28_000;

export type SearchLoadingOverlayProps = {
  open: boolean;
  /** Titre principal (ex. actualités / opportunités SEO). */
  title: string;
  /** Ligne principale sous le titre (thématique, sujet, multithématique…). */
  primaryLabel: string;
  /** Détails secondaires optionnels (pays · période, objectif · volume…). */
  detailLabel?: string | null;
  /**
   * Horodatage de démarrage côté serveur (ISO), pour un chronomètre cohérent
   * après rechargement. Sans valeur : démarre à l’ouverture locale de l’overlay.
   */
  startedAtIso?: string | null;
};

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

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

/**
 * Progression indicative (pas une mesure serveur) + temps écoulé réel.
 * Plafonne sous 100 % tant que la recherche n’est pas terminée côté parent.
 */
export function useSearchLoadingProgress(
  active: boolean,
  startedAtIso?: string | null
): {
  estimatePct: number;
  elapsedSec: number;
} {
  const [estimatePct, setEstimatePct] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const lockedStartRef = useRef<number | null>(null);
  const startedAtIsoRef = useRef(startedAtIso);
  startedAtIsoRef.current = startedAtIso;

  useEffect(() => {
    if (!active) {
      lockedStartRef.current = null;
      return;
    }
    // Verrouille l’instant de départ à l’activation (évite un reset
    // quand le run serveur arrive juste après le POST).
    if (lockedStartRef.current == null) {
      const parsed = startedAtIsoRef.current
        ? Date.parse(startedAtIsoRef.current)
        : Number.NaN;
      lockedStartRef.current = Number.isFinite(parsed) ? parsed : Date.now();
    }
    const startedAt = lockedStartRef.current;
    let frame = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        return;
      }
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      setElapsedSec(Math.floor(elapsedMs / 1000));
      const next = Math.min(
        ESTIMATE_CAP,
        Math.round(ESTIMATE_CAP * (1 - Math.exp(-elapsedMs / ESTIMATE_TAU_MS)))
      );
      setEstimatePct(next);
      frame = window.requestAnimationFrame(tick);
    };

    setEstimatePct(0);
    setElapsedSec(Math.floor(Math.max(0, Date.now() - startedAt) / 1000));
    frame = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [active]);

  return { estimatePct, elapsedSec };
}

/** @deprecated Alias de compatibilité — préférer `useSearchLoadingProgress`. */
export const useVeilleSearchProgress = useSearchLoadingProgress;

/**
 * Overlay plein écran (portail body) pendant une recherche longue.
 * Non fermable manuellement tant que `open` est vrai.
 */
export function SearchLoadingOverlay({
  open,
  title,
  primaryLabel,
  detailLabel,
  startedAtIso,
}: SearchLoadingOverlayProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { estimatePct, elapsedSec } = useSearchLoadingProgress(
    open,
    startedAtIso
  );
  const [mounted, setMounted] = useState(false);
  const pctLabel = Math.min(100, Math.max(0, estimatePct));

  // Annonces live limitées : paliers de 10 % et tick toutes les 10 s.
  const liveAnnouncement = useMemo(() => {
    const pctBucket = Math.floor(pctLabel / 10) * 10;
    const timeBucket = Math.floor(elapsedSec / 10) * 10;
    const timeText =
      elapsedSec < 2
        ? "moins d’une seconde"
        : timeBucket === 0
          ? `${elapsedSec} secondes`
          : `environ ${timeBucket} secondes`;
    return `${title} ${primaryLabel}. Estimation indicative ${pctBucket} pour cent. Temps écoulé : ${timeText}.`;
  }, [title, primaryLabel, pctLabel, elapsedSec]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusable = getFocusable(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialogRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [open]);

  if (!mounted || !open) {
    return null;
  }

  const detail = detailLabel?.trim() ? detailLabel.trim() : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-100/55 p-4 backdrop-blur-md"
      data-search-loading-overlay=""
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy="true"
        tabIndex={-1}
        className="max-h-[min(100dvh-2rem,36rem)] w-full max-w-[420px] overflow-y-auto outline-none"
      >
        <Card className="border border-[#E2E8F0] bg-white shadow-lg shadow-slate-900/5 ring-0">
          <CardContent className="px-5 py-7 text-center sm:px-6 sm:py-8">
            <div className="space-y-5">
              <div className="mx-auto flex h-[148px] w-[148px] items-center justify-center overflow-visible bg-transparent sm:h-[168px] sm:w-[168px]">
                {reducedMotion ? (
                  <span className="inline-flex size-20 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F5270] sm:size-24">
                    <Search className="size-10 sm:size-12" aria-hidden />
                  </span>
                ) : (
                  <img
                    src="/search.svg"
                    alt=""
                    width={168}
                    height={168}
                    decoding="async"
                    draggable={false}
                    className="pointer-events-none mx-auto h-full w-full border-0 bg-transparent object-contain shadow-none outline-none"
                    aria-hidden="true"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <p
                  id={titleId}
                  className="text-sm font-semibold text-slate-900"
                >
                  {title}
                </p>
                <p className="text-sm break-words text-slate-600">
                  <span className="font-medium text-slate-800">
                    {primaryLabel}
                  </span>
                  {detail ? (
                    <>
                      {" · "}
                      {detail}
                    </>
                  ) : null}
                </p>
              </div>

              <div className="space-y-2" aria-hidden="true">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={
                      reducedMotion
                        ? "h-full rounded-full bg-naxialis"
                        : "h-full rounded-full bg-naxialis transition-[width] duration-300 ease-out"
                    }
                    style={{ width: `${pctLabel}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>Estimation {pctLabel}&nbsp;%</span>
                  <span>
                    {elapsedSec < 2
                      ? "Temps écoulé : moins d’une seconde"
                      : `Temps écoulé : ${elapsedSec} s`}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Le pourcentage est une estimation visuelle. Le serveur ne
                  transmet pas encore de progression chiffrée.
                </p>
              </div>

              <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {liveAnnouncement}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>,
    document.body
  );
}
