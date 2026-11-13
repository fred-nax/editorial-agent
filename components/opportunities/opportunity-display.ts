export type OpportunitySource = {
  title: string;
  url: string;
  date?: string | null;
};

export type SimilarPost = {
  wpPostId: number;
  title: string;
  url: string;
  slug: string;
  score: number;
  reason: string;
};

export type SimilarTopic = {
  topicId: string;
  subject: string;
  score: number;
  reason: string;
};

export type ScoreRationale = {
  relevance?: string;
  commercial?: string;
  intent?: string;
  timeliness?: string;
  originality?: string;
};

export type ContentType = "news" | "evergreen" | "commercial";
export type TrendType = "emerging" | "news" | "evergreen" | "unverified";
export type TrendConfidence = "low" | "medium" | "high";
export type EditorialUrgency = "low" | "medium" | "high";

export type SourceQualification = {
  title: string;
  url: string;
  date?: string | null;
  domain?: string;
  relevance?: "direct" | "contextual" | "irrelevant" | "indeterminate";
  role?: "trend_evidence" | "documentary" | "excluded";
  exclusionReason?: string | null;
  sharedInBatch?: boolean;
};

export type TrendSignals = {
  independentDomains?: number;
  datedSources?: number;
  recent30?: number;
  recent90?: number;
  analysisVersion?: string;
  admissibleSourceCount?: number;
  documentarySourceCount?: number;
  excludedSourceCount?: number;
  sourceQualifications?: SourceQualification[];
  evidenceSources?: Array<{
    title: string;
    url: string;
    date?: string | null;
    domain?: string;
  }>;
  historyComparison?: {
    sourceCountDelta?: number;
    scoreDelta?: number;
    interpretation?: string;
  };
};

export type SeoOpportunityItem = {
  id: string;
  title: string;
  subject: string;
  angle: string | null;
  searchIntent: string | null;
  theme: string;
  contentType: ContentType;
  rationale: string | null;
  sources: OpportunitySource[] | null;
  naxialisService: string | null;
  status: "new" | "reviewed" | "added_to_queue" | "dismissed";
  scoreTotal: number;
  scoreRelevance: number;
  scoreCommercial: number;
  scoreIntent: number;
  scoreTimeliness: number;
  scoreOriginality: number;
  scoreRationale: ScoreRationale | null;
  similarPosts: SimilarPost[] | null;
  similarTopics: SimilarTopic[] | null;
  duplicateRisk: string | null;
  topicId: string | null;
  createdAt: string;
  trendType?: TrendType | null;
  trendScore?: number | null;
  trendConfidence?: TrendConfidence | null;
  trendJustification?: string | null;
  trendCheckedAt?: string | null;
  editorialUrgency?: EditorialUrgency | null;
  trendSignals?: TrendSignals | null;
};

export const CONTENT_LABELS: Record<ContentType, string> = {
  news: "Actualité",
  evergreen: "Evergreen",
  commercial: "Commercial",
};

export const TREND_LABELS: Record<TrendType, string> = {
  emerging: "Émergente",
  news: "Actualité ponctuelle",
  evergreen: "Evergreen",
  unverified: "Non démontrée",
};

export const URGENCY_LABELS: Record<EditorialUrgency, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
};

export const CONFIDENCE_LABELS: Record<TrendConfidence, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
};

export const STATUS_LABELS: Record<SeoOpportunityItem["status"], string> = {
  new: "Nouvelle",
  reviewed: "Revue",
  added_to_queue: "Ajoutée à la file",
  dismissed: "Écartée",
};

export function asSources(value: unknown): OpportunitySource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is OpportunitySource =>
      !!item &&
      typeof item === "object" &&
      typeof (item as OpportunitySource).title === "string" &&
      typeof (item as OpportunitySource).url === "string"
  );
}

export function asSimilarPosts(value: unknown): SimilarPost[] {
  return Array.isArray(value) ? (value as SimilarPost[]) : [];
}

export function asSimilarTopics(value: unknown): SimilarTopic[] {
  return Array.isArray(value) ? (value as SimilarTopic[]) : [];
}

export function scoreTone(score: number): string {
  if (score >= 80) {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (score >= 60) {
    return "bg-amber-50 text-amber-800 border-amber-200";
  }
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export function hasDuplicateRisk(risk: string | null | undefined): boolean {
  return Boolean(risk && risk !== "none");
}

export function formatThemeLabel(theme: string): string {
  return theme.replace(
    "Intelligence artificielle et agents IA",
    "IA / agents"
  );
}
