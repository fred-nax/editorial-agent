"use client";

import { SearchLoadingOverlay } from "@/components/SearchLoadingOverlay";

export type VeilleSearchLoadingOverlayProps = {
  open: boolean;
  theme: string;
  countryLabel: string;
  periodDays: number;
};

/**
 * Adapter Veille → overlay commun (compatibilité d’import).
 * Préférer `SearchLoadingOverlay` pour les nouveaux usages.
 */
export function VeilleSearchLoadingOverlay({
  open,
  theme,
  countryLabel,
  periodDays,
}: VeilleSearchLoadingOverlayProps) {
  return (
    <SearchLoadingOverlay
      open={open}
      title="Recherche d'actualités en cours…"
      primaryLabel={theme}
      detailLabel={`${countryLabel} · ${periodDays} jours`}
    />
  );
}
