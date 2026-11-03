export type LinkRelation =
  | "complement"
  | "prerequisite"
  | "deep_dive"
  | "comparison"
  | "practical_guide";

export type CatalogEntry = {
  wpPostId: number;
  title: string;
  url: string;
  slug: string;
  excerpt: string;
  categories: number[];
  tags: string[];
  theme: string;
  publishedAt: Date | null;
  status: string;
};

export type LinkCandidate = {
  entry: CatalogEntry;
  score: number;
  relation: LinkRelation;
  justification: string;
  suggestedAnchors: string[];
  suggestedSections: string[];
  rejected?: boolean;
  rejectReason?: string;
};

export type SelectedInternalLink = {
  url: string;
  title: string;
  wpPostId: number;
  score: number;
  relation: LinkRelation;
  justification: string;
  suggestedAnchors: string[];
  suggestedSections: string[];
};

export type InternalLinkPlan = {
  subject: string;
  themes: string[];
  catalogSize: number;
  catalogStale: boolean;
  candidates: LinkCandidate[];
  selected: SelectedInternalLink[];
  rejected: Array<{
    url: string;
    title: string;
    score: number;
    reason: string;
  }>;
  minScore: number;
  maxLinks: number;
};

export type SanitizeResult = {
  content: string;
  keptUrls: string[];
  removedUrls: string[];
  duplicateUrls: string[];
};
