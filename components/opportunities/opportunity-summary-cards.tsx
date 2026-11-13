"use client";

import { Flame, ListTodo, Search } from "lucide-react";
import { OpportunitySummaryCard } from "@/components/opportunities/opportunity-summary-card";

/**
 * Définitions métier (données réelles Prisma / filtres board) :
 * - détectées = count SeoOpportunity (liste API sans filtre)
 * - priorité haute = editorialUrgency === "high" (enum EditorialUrgency)
 * - à traiter = status === "new" (OpportunityStatus : nouvelles non traitées)
 */
export type OpportunitySummaryCounts = {
  detected: number;
  highPriority: number;
  toHandle: number;
};

export type OpportunitySummaryCardsProps = {
  counts: OpportunitySummaryCounts;
  /** True lorsque aucun filtre table n’est actif (vue globale). */
  isGlobalView: boolean;
  /** Filtre urgence actuel — valeur technique Prisma : high | medium | low. */
  urgencyFilter: string;
  /** Filtre statut actuel — new | reviewed | added_to_queue | dismissed. */
  statusFilter: string;
  onShowAll: () => void;
  onShowHighPriority: () => void;
  onShowToHandle: () => void;
};

export function OpportunitySummaryCards({
  counts,
  isGlobalView,
  urgencyFilter,
  statusFilter,
  onShowAll,
  onShowHighPriority,
  onShowToHandle,
}: OpportunitySummaryCardsProps) {
  const highActive = urgencyFilter === "high";
  const todoActive = statusFilter === "new" && urgencyFilter !== "high";

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="group"
      aria-label="Synthèse des opportunités SEO"
    >
      <OpportunitySummaryCard
        title="Opportunités détectées"
        value={counts.detected}
        description="Toutes les opportunités indexées"
        icon={Search}
        active={isGlobalView}
        onClick={onShowAll}
      />
      <OpportunitySummaryCard
        title="Priorité haute"
        value={counts.highPriority}
        description="À examiner en premier"
        icon={Flame}
        accent="orange"
        active={highActive}
        onClick={onShowHighPriority}
      />
      <OpportunitySummaryCard
        title="À traiter"
        value={counts.toHandle}
        description="Opportunités encore ouvertes"
        icon={ListTodo}
        active={todoActive}
        onClick={onShowToHandle}
      />
    </div>
  );
}
