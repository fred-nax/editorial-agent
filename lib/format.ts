export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

export function formatCost(value: number | null | undefined): string {
  return formatEstimatedCost(value);
}

/**
 * Affichage du coût LLM estimé (USD), préfixe `$`.
 * - null / NaN → "Inconnu" (distinct de zéro)
 * - 0 → "$0.00"
 * - |x| < 1 → 4 décimales ($0.0024, $0.0450, $0.1248)
 * - |x| ≥ 1 → 2 décimales ($1.25)
 * Ne masque plus les petits montants sous un plafond opaque.
 * Ce n’est jamais un montant facturé OpenAI — estimation LLM seule.
 */
export function formatEstimatedCost(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Inconnu";
  }

  if (value === 0) {
    return "$0.00";
  }

  const abs = Math.abs(value);
  const decimals = abs < 1 ? 4 : 2;
  const formatted = abs.toFixed(decimals);
  const sign = value < 0 ? "-" : "";
  return `${sign}$${formatted}`;
}

/** Libellé court pour tooltips / hints (hors images & tools). */
export function formatEstimatedCostHint(options?: {
  unknown?: boolean;
  partial?: boolean;
}): string {
  if (options?.unknown) {
    return "Coût LLM inconnu (modèle sans tarif ou tokens manquants). Hors images et outils.";
  }
  if (options?.partial) {
    return "Estimation LLM partielle — hors web_search, images et autres outils.";
  }
  return "Estimation LLM — hors éventuels frais liés aux outils et aux images.";
}

export function formatTokenCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("fr-FR").format(value);
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) {
    return "—";
  }

    const seconds = Math.round(durationMs / 1000);
    if (seconds < 60) {
      return `${seconds} s`;
    }

    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes} min ${rest} s`;
}

export function formatElapsed(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} min ${String(rest).padStart(2, "0")} s`;
}

export function formatCategories(value: unknown): string {
  if (!value) {
    return "—";
  }

  if (Array.isArray(value)) {
    const labels = value.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "name" in item) {
        return String((item as { name: unknown }).name);
      }
      return null;
    }).filter((item): item is string => Boolean(item));

    return labels.length > 0 ? labels.join(", ") : "—";
  }

  if (typeof value === "string") {
    return value;
  }

  return "—";
}
