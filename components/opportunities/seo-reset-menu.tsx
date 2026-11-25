"use client";

import { useEffect, useRef, useState } from "react";
import { Ellipsis, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { parseResponseJson } from "@/lib/http/parse-response-json";
import type { SeoResetPreview } from "@/lib/seo/reset-searches";

type Props = {
  disabled?: boolean;
  onResetComplete: () => Promise<void>;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
};

export function SeoResetMenu({
  disabled,
  onResetComplete,
  onError,
  onMessage,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [preview, setPreview] = useState<SeoResetPreview | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function openResetDialog() {
    setMenuOpen(false);
    setLoadingPreview(true);
    setPreview(null);
    setDialogOpen(true);
    try {
      const response = await fetch("/api/opportunities/reset");
      const payload = await parseResponseJson<{
        preview?: SeoResetPreview;
        error?: string;
      }>(response, "Impossible de préparer la réinitialisation");
      if (!response.ok || !payload.preview) {
        throw new Error(payload.error ?? "Aperçu indisponible.");
      }
      setPreview(payload.preview);
    } catch (err) {
      setDialogOpen(false);
      onError(
        err instanceof Error
          ? err.message
          : "Impossible de préparer la réinitialisation."
      );
    } finally {
      setLoadingPreview(false);
    }
  }

  async function confirmReset() {
    if (!preview?.canReset) {
      return;
    }
    setResetting(true);
    try {
      const response = await fetch("/api/opportunities/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const payload = await parseResponseJson<{
        error?: string;
        result?: {
          deletedOpportunities: number;
          deletedSearchRuns: number;
        };
      }>(response, "Réinitialisation impossible");
      if (!response.ok) {
        throw new Error(payload.error ?? "Réinitialisation refusée.");
      }
      setDialogOpen(false);
      onMessage(
        `Recherches SEO réinitialisées : ${payload.result?.deletedOpportunities ?? 0} opportunité(s), ${payload.result?.deletedSearchRuns ?? 0} recherche(s) supprimée(s).`
      );
      await onResetComplete();
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "Réinitialisation impossible."
      );
    } finally {
      setResetting(false);
    }
  }

  const empty =
    preview &&
    preview.opportunityCount === 0 &&
    preview.searchRunCount === 0;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <TooltipProvider delay={200}>
          <Tooltip>
            <TooltipTrigger
              type="button"
              delay={200}
              disabled={disabled}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Plus d’actions"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#0F5270]/30 disabled:pointer-events-none disabled:opacity-50"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Ellipsis className="size-4" aria-hidden />
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={6}
              className="z-[60] max-w-[220px] whitespace-nowrap border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-md [&>*:last-child]:bg-white [&>*:last-child]:fill-white"
            >
              Plus d’actions
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-40 mt-1 min-w-[16rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
              onClick={() => void openResetDialog()}
            >
              <RotateCcw className="size-3.5 shrink-0" aria-hidden />
              Réinitialiser les recherches SEO
            </button>
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (resetting) {
            return;
          }
          setDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser les recherches SEO ?</AlertDialogTitle>
            <AlertDialogDescription>
              {loadingPreview || !preview
                ? "Chargement du volume concerné…"
                : "Cette action supprime définitivement les recherches et opportunités SEO indiquées ci-dessous. Elle est irréversible."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {preview && !loadingPreview ? (
            <div className="space-y-2 text-sm text-slate-700">
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>{preview.searchRunCount}</strong> recherche(s) SEO
                </li>
                <li>
                  <strong>{preview.opportunityCount}</strong> opportunité(s)
                </li>
              </ul>
              {preview.linkedTopicRefs > 0 ? (
                <p>
                  {preview.linkedTopicRefs} opportunité(s) sont liées à la file
                  éditoriale via une référence souple. Les sujets{" "}
                  <strong>Topic</strong> correspondants ne seront pas
                  supprimés.
                </p>
              ) : null}
              <p className="text-slate-600">
                Conservés : configurations de recherche, thématiques, inventaire
                CMS, file éditoriale, articles et médias.
              </p>
              {!preview.canReset && preview.blockReason ? (
                <p className="font-medium text-amber-800">{preview.blockReason}</p>
              ) : null}
              {empty ? (
                <p className="text-slate-600">
                  Aucune donnée SEO à supprimer pour le moment.
                </p>
              ) : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                loadingPreview ||
                resetting ||
                !preview?.canReset ||
                Boolean(empty)
              }
              className="bg-red-700 text-white hover:bg-red-800"
              onClick={(event) => {
                event.preventDefault();
                void confirmReset();
              }}
            >
              {resetting
                ? "Suppression…"
                : "Confirmer la réinitialisation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
