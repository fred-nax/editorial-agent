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
 * Affichage compact du coût LLM estimé (USD).
 * 0.149378 → "0,149 $"
 * 0.0072   → "< 0,01 $"
 * null     → "—"
 */
export function formatEstimatedCost(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  if (value > 0 && value < 0.01) {
    return "< 0,01 $";
  }

  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);

  return `${formatted} $`;
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
