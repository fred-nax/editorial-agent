export const VEILLE_PERIODS = [7, 30, 90] as const;
export type VeillePeriod = (typeof VEILLE_PERIODS)[number];

export const MAX_VEILLE_RESULTS = 12;
export const MAX_THEME_LENGTH = 160;

export const VEILLE_COUNTRIES = [
  { code: "FR", label: "France", timezone: "Europe/Paris" },
  { code: "BE", label: "Belgique", timezone: "Europe/Brussels" },
  { code: "CH", label: "Suisse", timezone: "Europe/Zurich" },
  { code: "CA", label: "Canada", timezone: "America/Toronto" },
  { code: "LU", label: "Luxembourg", timezone: "Europe/Luxembourg" },
] as const;

export type VeilleCountryCode = (typeof VEILLE_COUNTRIES)[number]["code"];

export type VeilleQuery = {
  theme: string;
  periodDays: VeillePeriod;
  country: VeilleCountryCode;
};

export const VEILLE_KINDS = ["news", "study", "guide", "unknown"] as const;
export type VeilleKind = (typeof VEILLE_KINDS)[number];
export type VeilleFilter = "all" | VeilleKind;

export const VEILLE_KIND_LABELS: Record<VeilleKind, string> = {
  news: "Actualité",
  study: "Étude et rapport",
  guide: "Guide et analyse",
  unknown: "Non classé",
};

export type VeilleArticle = {
  title: string;
  sourceName: string;
  url: string;
  summary: string;
  event: string | null;
  kind: VeilleKind;
  /** YYYY-MM-DD seulement si une référence ou une métadonnée de publication le confirme. */
  publishedOn: string | null;
  dateVerified: boolean;
};

export type VeilleSearchResult = {
  theme: string;
  periodDays: VeillePeriod;
  country: string;
  articles: VeilleArticle[];
  discarded: number;
  incomplete: boolean;
  notice: string;
};

export type SearchReference = {
  url: string;
  title: string | null;
  date: string | null;
};

export const VEILLE_NOTICE =
  "Liste de sources trouvées pour la thématique. Ce n’est pas une mesure de popularité ni une tendance Google.";
