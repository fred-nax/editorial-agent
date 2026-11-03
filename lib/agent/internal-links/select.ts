import { CATEGORY_MAP } from "../../categories";
import {
  jaccardSimilarity,
  normalizeText,
  tokenize,
} from "../../seo/normalize";
import type {
  CatalogEntry,
  InternalLinkPlan,
  LinkCandidate,
  LinkRelation,
  SelectedInternalLink,
} from "./types";

export const DEFAULT_MIN_SCORE = 0.28;
export const DEFAULT_MAX_LINKS = 4;

/** Thèmes “hubs” souvent répétés hors contexte — pénalité si hors sujet. */
const HUB_SLUG_NEEDLES = [
  "facturation",
  "brevo",
  "saas",
  "automatisation-facturation",
  "application-saas",
  "wordpress-brevo",
];

type ThemeCluster = {
  id: string;
  labels: string[];
  keywords: string[];
  relationHint: LinkRelation;
};

const THEME_CLUSTERS: ThemeCluster[] = [
  {
    id: "security",
    labels: ["sécurité", "cybersécurité", "faille", "cve", "auth"],
    keywords: [
      "securite",
      "securiser",
      "faille",
      "cve",
      "phishing",
      "authentification",
      "autorisation",
      "ssl",
      "tls",
      "vulnerabilite",
      "cybersecurite",
    ],
    relationHint: "deep_dive",
  },
  {
    id: "email_security",
    labels: ["dmarc", "spf", "dkim", "email", "messagerie"],
    keywords: [
      "dmarc",
      "spf",
      "dkim",
      "email",
      "messagerie",
      "deliverability",
      "phishing",
      "brevo",
      "smtp",
    ],
    relationHint: "practical_guide",
  },
  {
    id: "agents_mcp",
    labels: ["mcp", "agent", "agents ia", "llm"],
    keywords: [
      "mcp",
      "agent",
      "agents",
      "llm",
      "openai",
      "outil",
      "tool",
      "autonomie",
    ],
    relationHint: "complement",
  },
  {
    id: "api",
    labels: ["api", "rest", "webhook", "intégration"],
    keywords: [
      "api",
      "rest",
      "webhook",
      "integration",
      "integrer",
      "endpoint",
      "graphql",
    ],
    relationHint: "prerequisite",
  },
  {
    id: "wordpress",
    labels: ["wordpress", "headless", "woocommerce"],
    keywords: [
      "wordpress",
      "headless",
      "woocommerce",
      "gutenberg",
      "plugin",
      "wp",
    ],
    relationHint: "practical_guide",
  },
  {
    id: "automation",
    labels: ["automatisation", "n8n", "make", "workflow"],
    keywords: [
      "automatisation",
      "automatiser",
      "n8n",
      "make",
      "workflow",
      "zapier",
    ],
    relationHint: "practical_guide",
  },
  {
    id: "saas",
    labels: ["saas", "application métier"],
    keywords: ["saas", "application", "metier", "b2b"],
    relationHint: "comparison",
  },
  {
    id: "seo",
    labels: ["seo", "geo", "référencement"],
    keywords: [
      "seo",
      "geo",
      "referencement",
      "schema",
      "serp",
      "contenu",
    ],
    relationHint: "complement",
  },
];

export function extractSubjectThemes(subject: string): string[] {
  const normalized = normalizeText(subject);
  const themes: string[] = [];
  for (const cluster of THEME_CLUSTERS) {
    if (
      cluster.keywords.some(
        (keyword) =>
          normalized.includes(keyword) ||
          tokenize(subject).includes(keyword)
      )
    ) {
      themes.push(cluster.id);
    }
  }
  for (const category of CATEGORY_MAP) {
    if (
      category.keywords.some((keyword) =>
        subject.toLowerCase().includes(keyword.toLowerCase())
      )
    ) {
      themes.push(`cat:${category.categoryId}`);
    }
  }
  return [...new Set(themes)];
}

function subjectTokens(subject: string): string[] {
  return tokenize(subject);
}

function entryTokens(entry: CatalogEntry): string[] {
  return tokenize(`${entry.title} ${entry.excerpt} ${entry.slug.replace(/-/g, " ")}`);
}

function clusterPresent(blob: string, tokens: string[], cluster: ThemeCluster): boolean {
  return cluster.keywords.some((keyword) => {
    if (keyword.length <= 3) {
      return tokens.includes(keyword);
    }
    return blob.includes(keyword) || tokens.includes(keyword);
  });
}

function sharedClusterIds(subject: string, entry: CatalogEntry): ThemeCluster[] {
  const subjectNorm = normalizeText(subject);
  const entryNorm = normalizeText(
    `${entry.title} ${entry.excerpt} ${entry.slug}`
  );
  const subjectTok = tokenize(subject);
  const entryTok = entryTokens(entry);
  return THEME_CLUSTERS.filter((cluster) => {
    return (
      clusterPresent(subjectNorm, subjectTok, cluster) &&
      clusterPresent(entryNorm, entryTok, cluster)
    );
  });
}

function isHubOffTopic(subject: string, entry: CatalogEntry): boolean {
  const slug = entry.slug.toLowerCase();
  const subjectNorm = normalizeText(subject);
  const hubHit = HUB_SLUG_NEEDLES.some((needle) => slug.includes(needle));
  if (!hubHit) {
    return false;
  }
  // Hub autorisé seulement si le sujet partage clairement le même theme.
  if (slug.includes("facturation") && subjectNorm.includes("factur")) {
    return false;
  }
  if (slug.includes("brevo") && /(brevo|email|newsletter|dmarc|smtp)/.test(subjectNorm)) {
    return false;
  }
  if (slug.includes("saas") && subjectNorm.includes("saas")) {
    return false;
  }
  return true;
}

function buildAnchors(entry: CatalogEntry, relation: LinkRelation): string[] {
  const shortTitle =
    entry.title.length > 70 ? `${entry.title.slice(0, 67)}…` : entry.title;
  const anchors = [
    shortTitle,
    `notre guide sur ${entry.title.toLowerCase().slice(0, 60)}`,
  ];
  if (relation === "prerequisite") {
    anchors.push(`les bases : ${entry.title.slice(0, 50)}`);
  }
  if (relation === "deep_dive") {
    anchors.push(`approfondir : ${entry.title.slice(0, 50)}`);
  }
  if (relation === "practical_guide") {
    anchors.push(`la mise en pratique détaillée`);
  }
  return [...new Set(anchors)].slice(0, 4);
}

function buildSections(themes: string[], relation: LinkRelation): string[] {
  const sections: string[] = [];
  if (themes.includes("security") || themes.includes("email_security")) {
    sections.push("Bonnes pratiques de sécurité");
  }
  if (themes.includes("agents_mcp")) {
    sections.push("Contexte agents IA / MCP");
  }
  if (themes.includes("api")) {
    sections.push("APIs et intégrations");
  }
  if (relation === "practical_guide") {
    sections.push("Mise en œuvre");
  }
  if (sections.length === 0) {
    sections.push("Développement du sujet", "Pour aller plus loin");
  }
  return sections.slice(0, 3);
}

/** Clusters trop larges pour valider seuls une destination. */
const BROAD_CLUSTERS = new Set([
  "security",
  "wordpress",
  "saas",
  "automation",
  "seo",
  "api",
]);

function scoreEntry(
  subject: string,
  themes: string[],
  entry: CatalogEntry
): LinkCandidate {
  const lexical = jaccardSimilarity(subjectTokens(subject), entryTokens(entry));
  const clusters = sharedClusterIds(subject, entry);
  const specificClusters = clusters.filter((c) => !BROAD_CLUSTERS.has(c.id));
  const clusterBoost = Math.min(
    0.5,
    specificClusters.length * 0.22 +
      Math.max(0, clusters.length - specificClusters.length) * 0.08
  );

  let categoryBoost = 0;
  for (const theme of themes) {
    if (!theme.startsWith("cat:")) {
      continue;
    }
    const id = Number(theme.slice(4));
    if (entry.categories.includes(id)) {
      categoryBoost = Math.max(categoryBoost, 0.12);
    }
  }

  // Bonus titre : inclusion d'un token thématique fort du sujet.
  const subjectKeyTokens = subjectTokens(subject).filter((t) => t.length > 3);
  const titleNorm = normalizeText(entry.title);
  const titleHits = subjectKeyTokens.filter((t) => titleNorm.includes(t)).length;
  const titleBoost = Math.min(0.25, titleHits * 0.08);

  let score = lexical * 0.55 + clusterBoost + categoryBoost + titleBoost;

  let relation: LinkRelation = "complement";
  let justification = `Similarité lexicale ${Math.round(lexical * 100)} %`;
  if (clusters.length > 0) {
    relation = (specificClusters[0] ?? clusters[0])!.relationHint;
    justification = `Thèmes partagés : ${clusters.map((c) => c.id).join(", ")} (${Math.round(score * 100)} %)`;
  } else if (titleHits >= 2) {
    relation = "deep_dive";
    justification = `Recouvrement fort du titre (${titleHits} termes)`;
  }

  // Le sujet a un focus spécialisé (ex. email_security, agents_mcp) :
  // on refuse les matches uniquement « larges » (security générique, etc.).
  const subjectSpecific = themes.filter(
    (theme) => !theme.startsWith("cat:") && !BROAD_CLUSTERS.has(theme)
  );
  if (subjectSpecific.length > 0) {
    const sharesSpecific = specificClusters.some((c) =>
      subjectSpecific.includes(c.id)
    );
    const strongLexical = lexical >= 0.32 || titleHits >= 2;
    if (!sharesSpecific && !strongLexical) {
      score = Math.min(score, 0.2);
      justification = `${justification} — hors focus ${subjectSpecific.join("/")}`;
    }
  }

  if (isHubOffTopic(subject, entry)) {
    score *= 0.35;
    justification = `${justification} — hub commercial hors sujet (pénalité)`;
  }

  // Spécificité : un slug long et ciblé bat un hub générique à score égal.
  if (entry.slug.split("-").length >= 4 && lexical >= 0.2) {
    score += 0.03;
  }

  score = Math.max(0, Math.min(1, score));

  return {
    entry,
    score,
    relation,
    justification,
    suggestedAnchors: buildAnchors(entry, relation),
    suggestedSections: buildSections(themes, relation),
  };
}

export type SelectOptions = {
  minScore?: number;
  maxLinks?: number;
  /** URLs à exclure (ex. page supprimée / déjà utilisée). */
  excludeUrls?: string[];
  /**
   * Soft diversification : URLs récemment proposées (autres articles).
   * Pénalité légère, jamais un ban — une page très pertinente reste sélectionnable.
   */
  recentUrls?: string[];
};

export function selectInternalLinks(
  subject: string,
  catalog: CatalogEntry[],
  options: SelectOptions = {}
): InternalLinkPlan {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const maxLinks = options.maxLinks ?? DEFAULT_MAX_LINKS;
  const exclude = new Set(
    (options.excludeUrls ?? []).map((u) => u.replace(/\/$/, "").toLowerCase())
  );
  const recent = new Set(
    (options.recentUrls ?? []).map((u) => u.replace(/\/$/, "").toLowerCase())
  );
  const themes = extractSubjectThemes(subject);

  const scored: LinkCandidate[] = [];
  for (const entry of catalog) {
    const key = entry.url.replace(/\/$/, "").toLowerCase();
    if (exclude.has(key)) {
      scored.push({
        entry,
        score: 0,
        relation: "complement",
        justification: "Exclue (URL absente / retirée)",
        suggestedAnchors: [],
        suggestedSections: [],
        rejected: true,
        rejectReason: "URL exclue du catalogue autorisé",
      });
      continue;
    }

    const candidate = scoreEntry(subject, themes, entry);
    if (recent.has(key) && candidate.score < 0.55) {
      candidate.score = Math.max(0, candidate.score - 0.08);
      candidate.justification = `${candidate.justification} — récente (pénalité douce)`;
    }
    scored.push(candidate);
  }

  scored.sort((a, b) => b.score - a.score);

  const selected: SelectedInternalLink[] = [];
  const rejected: InternalLinkPlan["rejected"] = [];
  const usedUrls = new Set<string>();

  for (const candidate of scored) {
    const key = candidate.entry.url.replace(/\/$/, "").toLowerCase();
    if (candidate.rejected) {
      rejected.push({
        url: candidate.entry.url,
        title: candidate.entry.title,
        score: candidate.score,
        reason: candidate.rejectReason ?? "rejeté",
      });
      continue;
    }
    if (candidate.score < minScore) {
      if (rejected.length < 12) {
        rejected.push({
          url: candidate.entry.url,
          title: candidate.entry.title,
          score: candidate.score,
          reason: `Score insuffisant (${Math.round(candidate.score * 100)} % < ${Math.round(minScore * 100)} %)`,
        });
      }
      continue;
    }
    if (usedUrls.has(key)) {
      rejected.push({
        url: candidate.entry.url,
        title: candidate.entry.title,
        score: candidate.score,
        reason: "Doublon d’URL",
      });
      continue;
    }
    if (selected.length >= maxLinks) {
      rejected.push({
        url: candidate.entry.url,
        title: candidate.entry.title,
        score: candidate.score,
        reason: "Quota de diversité atteint",
      });
      continue;
    }

    usedUrls.add(key);
    selected.push({
      url: candidate.entry.url,
      title: candidate.entry.title,
      wpPostId: candidate.entry.wpPostId,
      score: candidate.score,
      relation: candidate.relation,
      justification: candidate.justification,
      suggestedAnchors: candidate.suggestedAnchors,
      suggestedSections: candidate.suggestedSections,
    });
  }

  return {
    subject,
    themes,
    catalogSize: catalog.length,
    catalogStale: false,
    candidates: scored.slice(0, 20),
    selected,
    rejected,
    minScore,
    maxLinks,
  };
}
