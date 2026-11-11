import { Badge } from "@/components/ui/badge";
import { runningStatusHint } from "@/lib/progress";
import type { GenerationStatus, TopicStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

const generationStyles: Record<GenerationStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  queued: "border-amber-200 bg-amber-50 text-amber-800",
  running: "border-sky-200 bg-sky-50 text-sky-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-red-200 bg-red-50 text-red-800",
};

const generationLabels: Record<GenerationStatus, string> = {
  pending: "En attente",
  queued: "En file",
  running: "En cours",
  completed: "Terminé",
  failed: "Erreur",
};

const topicStyles: Record<TopicStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  generating: "border-sky-200 bg-sky-50 text-sky-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  archived: "border-slate-200 bg-slate-100 text-slate-600",
};

const topicLabels: Record<TopicStatus, string> = {
  pending: "En attente",
  generating: "Génération",
  completed: "Terminé",
  archived: "Archivé",
};

export function GenerationStatusBadge({
  status,
  progressStage,
}: {
  status: GenerationStatus;
  progressStage?: string | null;
}) {
  const hint = runningStatusHint(status, progressStage);
  if (hint) {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-sky-200 bg-sky-50 text-sky-800"
      >
        {hint}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full", generationStyles[status])}
    >
      {generationLabels[status]}
    </Badge>
  );
}

export function TopicStatusBadge({ status }: { status: TopicStatus }) {
  return (
    <Badge variant="outline" className={cn("rounded-full", topicStyles[status])}>
      {topicLabels[status]}
    </Badge>
  );
}
