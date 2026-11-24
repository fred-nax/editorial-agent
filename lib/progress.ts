import type { CmsDestinationId } from "@/lib/cms/types";
import type { GenerationStatus } from "./status";

export type GenerationStage =
  | "queued"
  | "preparing"
  | "researching"
  | "writing"
  | "creating_wordpress"
  | "creating_webflow"
  | "finalizing"
  | "completed"
  | "failed";

export type AgentProgressEvent = {
  stage: GenerationStage;
  message: string;
};

export const GENERATION_TIMELINE_STEPS = [
  { stage: "preparing", label: "Préparation" },
  { stage: "researching", label: "Recherche" },
  { stage: "writing", label: "Rédaction" },
  { stage: "creating_wordpress", label: "Création WordPress" },
  { stage: "finalizing", label: "Finalisation" },
] as const;

export function getGenerationTimelineSteps(
  destination: CmsDestinationId | string | null | undefined
) {
  const isWebflow = destination === "webflow";
  return [
    { stage: "preparing" as const, label: "Préparation" },
    { stage: "researching" as const, label: "Recherche" },
    { stage: "writing" as const, label: "Rédaction" },
    {
      stage: (isWebflow ? "creating_webflow" : "creating_wordpress") as
        | "creating_webflow"
        | "creating_wordpress",
      label: isWebflow ? "Création Webflow" : "Création WordPress",
    },
    { stage: "finalizing" as const, label: "Finalisation" },
  ];
}

const STAGE_ORDER: GenerationStage[] = [
  "queued",
  "preparing",
  "researching",
  "writing",
  "creating_wordpress",
  "finalizing",
  "completed",
];

const STAGE_SHORT_LABEL: Record<GenerationStage, string> = {
  queued: "File d’attente",
  preparing: "Préparation",
  researching: "Recherche",
  writing: "Rédaction",
  creating_wordpress: "Création WordPress",
  creating_webflow: "Création Webflow",
  finalizing: "Finalisation",
  completed: "Terminé",
  failed: "Échec",
};

export const PROGRESS_MESSAGES = {
  queued: "En file d’attente…",
  preparing: "Préparation de la génération…",
  sessionReady: "Session OpenAI initialisée.",
  researchingAndWriting: "Agent en cours de recherche et rédaction…",
  researching: "Recherche de sources et d’informations…",
  writing: "Rédaction de l’article…",
  creatingWordpress: "Création du brouillon WordPress…",
  creatingWebflow: "Création du brouillon Webflow…",
  finalizing: "Finalisation de la génération…",
  completed: "Article terminé.",
  failed: "La génération a échoué.",
  interrupted: "Génération interrompue.",
} as const;

export function isGenerationStage(
  value: string | null | undefined
): value is GenerationStage {
  return (
    value === "queued" ||
    value === "preparing" ||
    value === "researching" ||
    value === "writing" ||
    value === "creating_wordpress" ||
    value === "creating_webflow" ||
    value === "finalizing" ||
    value === "completed" ||
    value === "failed"
  );
}

export function stageIndex(stage: GenerationStage | null | undefined): number {
  if (!stage || stage === "failed") {
    return -1;
  }
  // creating_webflow occupe le même cran que creating_wordpress dans la timeline.
  if (stage === "creating_webflow") {
    return STAGE_ORDER.indexOf("creating_wordpress");
  }
  return STAGE_ORDER.indexOf(stage);
}

export function isProgressAhead(
  next: GenerationStage,
  current: GenerationStage | null | undefined
): boolean {
  if (next === "failed") {
    return current !== "failed";
  }
  if (!current || current === "failed") {
    return true;
  }
  return stageIndex(next) >= stageIndex(current);
}

export function resolveProgressStage(
  status: GenerationStatus,
  progressStage: string | null | undefined
): GenerationStage {
  if (isGenerationStage(progressStage)) {
    return progressStage;
  }
  if (status === "queued") {
    return "queued";
  }
  if (status === "running") {
    return "preparing";
  }
  if (status === "completed") {
    return "completed";
  }
  if (status === "failed") {
    return "failed";
  }
  return "queued";
}

export function stageShortLabel(stage: GenerationStage): string {
  return STAGE_SHORT_LABEL[stage];
}

export function runningStatusHint(
  status: GenerationStatus,
  progressStage: string | null | undefined
): string | null {
  if (status !== "running" && status !== "queued") {
    return null;
  }
  const stage = resolveProgressStage(status, progressStage);
  if (status === "queued") {
    return "En file";
  }
  return `En cours · ${stageShortLabel(stage)}`;
}

export type TimelineStepState = "complete" | "current" | "upcoming" | "failed";

/**
 * Étape affichée pour un échec : conserve la dernière étape métier
 * (recherche/rédaction/création) au lieu de retomber sur « Préparation ».
 */
export function resolveFailedDisplayStage(
  status: GenerationStatus,
  progressStage: GenerationStage
): GenerationStage {
  if (status !== "failed" && progressStage !== "failed") {
    return progressStage;
  }
  if (
    progressStage !== "failed" &&
    progressStage !== "queued" &&
    progressStage !== "completed"
  ) {
    return progressStage;
  }
  // Anciens enregistrements : progressStage stocké comme "failed".
  return "writing";
}

export function timelineStepState(
  stepStage:
    | "preparing"
    | "researching"
    | "writing"
    | "creating_wordpress"
    | "creating_webflow"
    | "finalizing",
  status: GenerationStatus,
  progressStage: GenerationStage
): TimelineStepState {
  const stepIdx = stageIndex(stepStage);
  const failed =
    status === "failed" || progressStage === "failed";
  const displayStage = failed
    ? resolveFailedDisplayStage(status, progressStage)
    : progressStage;
  const currentIdx = stageIndex(displayStage);

  if (failed) {
    const failedIdx = currentIdx < 0 ? stageIndex("writing") : currentIdx;
    if (stepIdx < failedIdx) {
      return "complete";
    }
    if (stepIdx === failedIdx) {
      return "failed";
    }
    return "upcoming";
  }

  if (progressStage === "completed" || status === "completed") {
    return "complete";
  }

  if (progressStage === "queued") {
    return stepIdx === 0 ? "current" : "upcoming";
  }

  if (stepIdx < currentIdx) {
    return "complete";
  }
  if (stepIdx === currentIdx) {
    return "current";
  }
  return "upcoming";
}

export function failedStepLabel(progressStage: GenerationStage): string {
  const display = resolveFailedDisplayStage("failed", progressStage);
  return `Échec pendant : ${stageShortLabel(display)}`;
}

/**
 * Conserve la dernière étape métier lors d’un échec (ne remplace pas par "failed").
 */
export function preserveProgressStageOnFailure(
  currentStage: string | null | undefined
): GenerationStage {
  if (
    isGenerationStage(currentStage) &&
    currentStage !== "failed" &&
    currentStage !== "completed" &&
    currentStage !== "queued"
  ) {
    return currentStage;
  }
  return "writing";
}
