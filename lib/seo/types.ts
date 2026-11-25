export type OpportunityContentType = "news" | "evergreen" | "commercial";

export const OPPORTUNITY_CONTENT_TYPES: OpportunityContentType[] = [
  "news",
  "evergreen",
  "commercial",
];

export const NAXIALIS_SERVICES = [
  "Agents IA",
  "Automatisation",
  "WordPress / WooCommerce",
  "SaaS sur mesure",
  "SEO / GEO",
  "API et intégrations",
  "Développement web",
] as const;

/** @deprecated Préférer EDITORIAL_DOMAINS — conservé pour compat UI/tests. */
export { SEO_THEME_LABELS as SEO_THEMES } from "./domains";

export type OpportunitySource = {
  title: string;
  url: string;
  date?: string | null;
};

export type RawOpportunityCandidate = {
  title: string;
  subject: string;
  angle?: string | null;
  searchIntent?: string | null;
  theme: string;
  rationale?: string | null;
  sources?: OpportunitySource[];
  naxialisService?: string | null;
  contentType?: OpportunityContentType | null;
};

export type SimilarPostMatch = {
  /** Présent pour les articles WordPress historiques ; null pour Webflow / opportunités. */
  wpPostId: number | null;
  /** Identifiant CMS ou `opportunity:{id}` pour une opportunité déjà enregistrée. */
  cmsExternalId?: string;
  cmsProvider?: "wordpress" | "webflow";
  title: string;
  /** URL publique si connue ; chaîne vide sinon (jamais inventée). */
  url: string;
  slug: string;
  score: number;
  reason: string;
};

export type SimilarTopicMatch = {
  topicId: string;
  subject: string;
  score: number;
  reason: string;
};

export type ScoreThemeCatalogEntry = {
  label: string;
  explorationAngles: string[];
};

export type ScoreContext = {
  duplicateRisk: "none" | "low" | "medium" | "high";
  similarMaxScore?: number;
  similarPostCount?: number;
  batchSiblingScore?: number;
  /** Sujet libre / thématique hors catalogue. */
  freeTopic?: boolean;
  researchGoal?: "seo" | "trends" | "problems" | "commercial";
  /** Catalogue dynamique V7.5 pour le scoring de pertinence. */
  themeCatalog?: ScoreThemeCatalogEntry[];
};

export type ScoreBreakdown = {
  relevance: number;
  commercial: number;
  intent: number;
  timeliness: number;
  originality: number;
  total: number;
  rationale: {
    relevance: string;
    commercial: string;
    intent: string;
    timeliness: string;
    originality: string;
  };
};
