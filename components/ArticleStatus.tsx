import type { GenerationStatus, TopicStatus } from "@/lib/status";

type Status = GenerationStatus | TopicStatus;

const styles: Record<Status, string> = {
  queued: "border-amber-200 bg-amber-50 text-amber-800",
  running: "border-sky-200 bg-sky-50 text-sky-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-red-200 bg-red-50 text-red-800",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  generating: "border-sky-200 bg-sky-50 text-sky-800",
  archived: "border-slate-200 bg-slate-100 text-slate-600",
};

const labels: Record<Status, string> = {
  queued: "En file",
  running: "En cours",
  completed: "Terminé",
  failed: "Erreur",
  pending: "En attente",
  generating: "Génération",
  archived: "Archivé",
};

export function ArticleStatus({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
