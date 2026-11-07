import {
  VEILLE_KIND_LABELS,
  type VeilleArticle,
  type VeilleFilter,
  type VeilleKind,
} from "./types";

const NEWS_TERMS = [
  "actualité",
  "annonce",
  "événement",
  "réglementation",
  "réglementaire",
  "communiqué",
  "décret",
  "amende",
  "entre en vigueur",
  "lancement",
  "breaking",
];

const STUDY_TERMS = [
  "étude",
  "rapport",
  "enquête",
  "benchmark",
  "statistique",
  "statistiques",
  "baromètre",
  "sondage",
  "livre blanc",
  "white paper",
];

const GUIDE_TERMS = [
  "guide",
  "analyse",
  "comparatif",
  "tutoriel",
  "retour d'expérience",
  "mode d'emploi",
  "décryptage",
];

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function mentions(text: string, term: string): boolean {
  const body = fold(text);
  const needle = fold(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`, "i").test(body);
}

function scoreText(text: string, terms: string[], weight: number): number {
  return terms.reduce((total, term) => total + (mentions(text, term) ? weight : 0), 0);
}

export function classifyPublication(input: {
  title: string;
  url: string;
  summary: string;
  event: string | null;
  hintedKind?: unknown;
}): VeilleKind {
  let path = "";
  try {
    path = decodeURIComponent(new URL(input.url).pathname);
  } catch {
    path = "";
  }
  const scores: Record<Exclude<VeilleKind, "unknown">, number> = {
    news:
      scoreText(input.title, NEWS_TERMS, 3) +
      scoreText(path, NEWS_TERMS, 2) +
      scoreText(input.event ?? "", NEWS_TERMS, 2) +
      scoreText(input.summary, NEWS_TERMS, 1),
    study:
      scoreText(input.title, STUDY_TERMS, 3) +
      scoreText(path, STUDY_TERMS, 2) +
      scoreText(input.event ?? "", STUDY_TERMS, 2) +
      scoreText(input.summary, STUDY_TERMS, 1),
    guide:
      scoreText(input.title, GUIDE_TERMS, 3) +
      scoreText(path, GUIDE_TERMS, 2) +
      scoreText(input.event ?? "", GUIDE_TERMS, 2) +
      scoreText(input.summary, GUIDE_TERMS, 1),
  };
  const ranked = (Object.entries(scores) as Array<[Exclude<VeilleKind, "unknown">, number]>)
    .sort((left, right) => right[1] - left[1]);
  const [topKind, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const hint =
    input.hintedKind === "news" ||
    input.hintedKind === "study" ||
    input.hintedKind === "guide"
      ? input.hintedKind
      : null;

  if (topScore >= 3 && topScore >= secondScore + 2) {
    return topKind;
  }
  if (hint && (topScore === 0 || hint === topKind)) {
    return hint;
  }
  return "unknown";
}

export function countByKind(articles: VeilleArticle[]): Record<VeilleKind, number> {
  const counts: Record<VeilleKind, number> = {
    news: 0,
    study: 0,
    guide: 0,
    unknown: 0,
  };
  for (const article of articles) {
    counts[article.kind] += 1;
  }
  return counts;
}

export function filterArticles(
  articles: VeilleArticle[],
  filter: VeilleFilter
): VeilleArticle[] {
  if (filter === "all") {
    return articles;
  }
  return articles.filter((article) => article.kind === filter);
}

export function kindLabel(kind: VeilleKind): string {
  return VEILLE_KIND_LABELS[kind];
}
