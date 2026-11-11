import { db } from "@/lib/db";
import {
  compareEditorialSimilarity,
  nearlyIdenticalText,
} from "@/lib/seo/editorial-similarity";
import { normalizeText, slugify, tokenize } from "@/lib/seo/normalize";
import { compareTitleSimilarity } from "@/lib/seo/similarity";
import { getWordPressInventoryDiagnostic } from "@/lib/seo/wordpress-inventory";
import {
  resolveInventoryCoverage,
  type InventoryCoverage,
} from "@/lib/veille/editorial-duplicates";
import {
  conceptLabel,
  conceptWeight,
  domainsConflictWithoutBridge,
  extractEditorialConcepts,
  relatedConceptPairs,
  sharedConceptIds,
  sharedDomains,
  type ExtractedConcepts,
} from "./editorial-concepts";
import {
  extractEditorialIntentions,
  intentionLabel,
  intentionOverlapScore,
  type EditorialIntention,
} from "./editorial-intentions";
import {
  EDITORIAL_THRESHOLDS,
  INVENTORY_STALE_AFTER_MS,
  MAX_EDITORIAL_ANGLE_LENGTH,
  MAX_EDITORIAL_MATCHES,
  MAX_EDITORIAL_SUBJECT_LENGTH,
  MIN_SUBJECT_CHARS_FOR_CHECK,
} from "./editorial-similarity-config";
import {
  RAPPROCHEMENT_MESSAGES,
  type EditorialInventoryMeta,
  type EditorialMatch,
  type EditorialRapprochementResult,
  type RapprochementKind,
} from "./editorial-similarity-types";
import { decodeHtmlEntities } from "@/lib/seo/normalize";

export type PublishedPostRecord = {
  wpPostId: number;
  title: string;
  slug: string;
  url: string;
  excerpt: string | null;
};

function httpUrl(value: string | null | undefined): string | null {
  if (!value || !/^https?:\/\//i.test(value)) {
    return null;
  }
  return value;
}

export function isSubjectSignificant(subject: string): boolean {
  const cleaned = subject.replace(/\s+/g, " ").trim();
  if (cleaned.length < MIN_SUBJECT_CHARS_FOR_CHECK) {
    return false;
  }
  return tokenize(cleaned).length >= 3;
}

export function parseEditorialSubjectInput(body: unknown):
  | { ok: true; subject: string; angle: string | null }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Corps JSON invalide." };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.subject !== "string") {
    return { ok: false, error: "Le sujet est obligatoire." };
  }
  const subject = record.subject.replace(/\s+/g, " ").trim();
  if (!subject) {
    return { ok: false, error: "Le sujet est obligatoire." };
  }
  if (subject.length > MAX_EDITORIAL_SUBJECT_LENGTH) {
    return {
      ok: false,
      error: `Le sujet ne peut pas dépasser ${MAX_EDITORIAL_SUBJECT_LENGTH} caractères.`,
    };
  }
  let angle: string | null = null;
  if (record.angle != null && record.angle !== "") {
    if (typeof record.angle !== "string") {
      return { ok: false, error: "L’angle est invalide." };
    }
    const cleaned = record.angle.replace(/\s+/g, " ").trim();
    if (cleaned.length > MAX_EDITORIAL_ANGLE_LENGTH) {
      return {
        ok: false,
        error: `L’angle ne peut pas dépasser ${MAX_EDITORIAL_ANGLE_LENGTH} caractères.`,
      };
    }
    angle = cleaned || null;
  }
  return { ok: true, subject, angle };
}

function sharedDistinctiveTokenCount(
  left: ExtractedConcepts,
  right: ExtractedConcepts
): number {
  const rightSet = new Set(right.distinctiveTokens);
  return left.distinctiveTokens.filter((token) => rightSet.has(token)).length;
}

function technicalOverlapScore(
  left: ExtractedConcepts,
  right: ExtractedConcepts
): {
  sharedConcepts: string[];
  relatedPairs: Array<[string, string]>;
  domainOverlap: ReturnType<typeof sharedDomains>;
  distinctiveOverlap: number;
  score: number;
} {
  const sharedConcepts = sharedConceptIds(left.conceptIds, right.conceptIds);
  const relatedPairs = relatedConceptPairs(left.conceptIds, right.conceptIds);
  const domainOverlap = sharedDomains(left.domains, right.domains);
  const distinctiveOverlap = sharedDistinctiveTokenCount(left, right);

  let score = 0;
  for (const id of sharedConcepts) {
    score += 0.34 * conceptWeight(id);
  }
  for (const [a, b] of relatedPairs) {
    score += 0.16 * Math.min(conceptWeight(a), conceptWeight(b));
  }
  score += Math.min(0.18, domainOverlap.length * 0.06);
  score += Math.min(0.16, distinctiveOverlap * 0.08);
  // Les termes faibles ajoutent au plus un léger contexte.
  const weakOverlap = left.weakTokens.filter((token) =>
    right.weakTokens.includes(token)
  ).length;
  score += Math.min(0.06, weakOverlap * 0.02);

  return {
    sharedConcepts,
    relatedPairs,
    domainOverlap,
    distinctiveOverlap,
    score: Math.min(1, score),
  };
}

/** Concepts trop généraux : jamais suffisants seuls pour un « sujet proche ». */
const BROAD_TECH_CONCEPTS = new Set(["ai_generic", "gen_ai", "chatgpt"]);

function substantiveSharedConcepts(sharedConcepts: string[]): string[] {
  return sharedConcepts.filter((id) => id !== "ai_generic");
}

function focusedSharedConcepts(sharedConcepts: string[]): string[] {
  return sharedConcepts.filter((id) => !BROAD_TECH_CONCEPTS.has(id));
}

function hasMeaningfulTechnicalSignal(overlap: {
  sharedConcepts: string[];
  relatedPairs: Array<[string, string]>;
  distinctiveOverlap: number;
}): boolean {
  return (
    substantiveSharedConcepts(overlap.sharedConcepts).length > 0 ||
    overlap.relatedPairs.length > 0 ||
    overlap.distinctiveOverlap >= 2
  );
}

function classifyRapprochement(input: {
  exact: boolean;
  blended: number;
  titleScore: number;
  overlap: ReturnType<typeof technicalOverlapScore>;
  intention: ReturnType<typeof intentionOverlapScore>;
  left: ExtractedConcepts;
  right: ExtractedConcepts;
}): RapprochementKind | null {
  const { exact, blended, titleScore, overlap, intention, left, right } = input;

  if (exact) {
    return "probable_duplicate";
  }

  // Faux positifs : seuls des termes faibles (sécurité, risque…) ou conflit de domaine.
  if (!hasMeaningfulTechnicalSignal(overlap)) {
    return null;
  }
  if (
    domainsConflictWithoutBridge(left.domains, right.domains) &&
    overlap.sharedConcepts.length === 0 &&
    overlap.relatedPairs.length === 0
  ) {
    return null;
  }

  const substantive = substantiveSharedConcepts(overlap.sharedConcepts);
  const focused = focusedSharedConcepts(overlap.sharedConcepts);
  const strongConcept =
    focused.some((id) => conceptWeight(id) >= 1.2) || focused.length >= 2;
  const intentionAligned = intention.aligned;
  const intentionBridge = intention.complementaryBridge;

  // Doublon : objet fort + intention alignée (titres strictement identiques déjà gérés).
  if (
    blended >= EDITORIAL_THRESHOLDS.probableMin &&
    strongConcept &&
    intentionAligned &&
    (titleScore >= 0.45 || focused.length >= 2)
  ) {
    return "probable_duplicate";
  }

  // Proche : correspondance technique significative + intention commune / très liée.
  // « IA générative » seule (ou paires tech sans intention) ne suffit jamais.
  if (
    blended >= EDITORIAL_THRESHOLDS.closeMin &&
    intentionAligned &&
    (focused.length >= 1 ||
      (substantive.length >= 1 && intention.shared.length >= 1) ||
      (overlap.relatedPairs.length >= 1 &&
        focused.length + intention.shared.length >= 1 &&
        overlap.distinctiveOverlap >= 1))
  ) {
    return "close";
  }

  // Complémentaire : objet apparenté + pont d’intention réel (pas la seule famille IA).
  if (
    blended >= EDITORIAL_THRESHOLDS.complementaryMin &&
    intentionBridge &&
    (overlap.relatedPairs.length >= 1 ||
      substantive.length >= 1 ||
      focused.length >= 1)
  ) {
    return "complementary";
  }

  return null;
}

function buildExplanation(input: {
  kind: RapprochementKind;
  overlap: ReturnType<typeof technicalOverlapScore>;
  intention: ReturnType<typeof intentionOverlapScore>;
  titleScore: number;
}): string {
  const { kind, overlap, intention, titleScore } = input;
  const labels = focusedSharedConcepts(overlap.sharedConcepts).map(conceptLabel);
  const broadLabels = substantiveSharedConcepts(overlap.sharedConcepts).map(
    conceptLabel
  );
  const intentShared = intention.shared.map(intentionLabel);
  const intentRelated = intention.related
    .slice(0, 1)
    .map(([a, b]) => `${intentionLabel(a)} / ${intentionLabel(b)}`);

  if (kind === "probable_duplicate") {
    if (titleScore >= 0.95) {
      return "Le titre proposé correspond très fortement à un article déjà publié.";
    }
    if (labels.length > 0 && intentShared.length > 0) {
      return `Les deux contenus abordent ${labels.slice(0, 2).join(" et ")} sous l’angle de ${intentShared[0]}.`;
    }
    if (labels.length > 0) {
      return `Les deux contenus abordent ${labels.slice(0, 2).join(" et ")}.`;
    }
    return "L’objet principal et l’intention éditoriale semblent déjà couverts par un article publié.";
  }

  if (kind === "close") {
    if (labels.length > 0 && intentShared.length > 0) {
      return `Les deux sujets abordent ${labels.slice(0, 2).join(" et ")}, avec des angles différents sur ${intentShared[0]}.`;
    }
    if (intentShared.length > 0 && broadLabels.length > 0) {
      return `Les contenus partagent ${intentShared[0]} autour de ${broadLabels[0]}.`;
    }
    if (labels.length > 0) {
      return `Les contenus partagent ${labels.slice(0, 2).join(" et ")}, avec un angle potentiellement distinct.`;
    }
    return "L’objet principal et l’intention de recherche sont très apparentés, avec une différence possible d’angle.";
  }

  if (
    overlap.sharedConcepts.includes("rag") &&
    intention.complementaryBridge
  ) {
    return "Cet article présente le RAG et la protection des données, un domaine complémentaire de la sécurité de l’IA.";
  }
  if (
    overlap.sharedConcepts.includes("chatgpt") &&
    intention.shared.includes("privacy_data")
  ) {
    return "Cet article traite de la confidentialité des données utilisées par ChatGPT, un aspect particulier de votre sujet.";
  }
  if (intentRelated.length > 0 && (labels.length > 0 || broadLabels.length > 0)) {
    const obj = labels[0] ?? broadLabels[0];
    return `Cet article aborde ${obj} sous l’angle de ${intentionLabel(intention.related[0]![1])}, complémentaire de votre sujet.`;
  }
  if (intentShared.length > 0 && broadLabels.length > 0) {
    return `Même intention (${intentShared[0]}) sur ${broadLabels[0]}, avec un objet principal différent.`;
  }
  if (labels.length > 0) {
    return `Cet article relève du même univers (${labels[0]}) avec une intention différente mais liée.`;
  }
  return "Relation éditoriale complémentaire détectée à partir des titres et extraits disponibles.";
}

export function scorePublishedPost(
  subject: string,
  angle: string | null,
  post: PublishedPostRecord
): EditorialMatch | null {
  const url = httpUrl(post.url);
  if (!url) {
    return null;
  }

  const title = decodeHtmlEntities(post.title);
  const excerpt = post.excerpt ? decodeHtmlEntities(post.excerpt) : null;

  const proposalText = `${subject} ${angle ?? ""}`;
  const postText = `${title} ${excerpt ?? ""} ${post.slug.replaceAll("-", " ")}`;
  const left = extractEditorialConcepts(proposalText);
  const right = extractEditorialConcepts(postText);
  const overlap = technicalOverlapScore(left, right);

  const leftIntentions = extractEditorialIntentions(proposalText);
  const rightIntentions = extractEditorialIntentions(postText);
  const intention = intentionOverlapScore(leftIntentions, rightIntentions);

  const postSubject = excerpt?.trim() || post.slug.replaceAll("-", " ");
  const editorial = compareEditorialSimilarity(
    {
      title: subject,
      subject,
      angle,
      searchIntent: angle,
    },
    {
      title,
      subject: postSubject,
      angle: null,
      searchIntent: null,
    }
  );

  const titleExact =
    nearlyIdenticalText(subject, title) ||
    compareTitleSimilarity(subject, title).score === 1 ||
    slugify(subject) === post.slug;

  const titleScore = Math.max(
    editorial.titleScore,
    compareTitleSimilarity(subject, `${title} ${postSubject}`).score
  );

  // Lexical léger + intention : ne doit jamais dominer les concepts techniques.
  const blended = Math.min(
    1,
    overlap.score * 0.64 +
      intention.score * 0.2 +
      editorial.score * 0.1 +
      titleScore * 0.06 +
      (titleExact ? 0.2 : 0)
  );

  const kind = classifyRapprochement({
    exact: titleExact,
    blended,
    titleScore,
    overlap,
    intention,
    left,
    right,
  });
  if (!kind) {
    return null;
  }

  return {
    kind,
    title,
    url,
    explanation: buildExplanation({ kind, overlap, intention, titleScore }),
    message: RAPPROCHEMENT_MESSAGES[kind],
    wpPostId: post.wpPostId,
    rankScore: titleExact ? 1 : blended,
  };
}

export function findEditorialRapprochements(
  subject: string,
  posts: PublishedPostRecord[],
  options?: { angle?: string | null; max?: number }
): EditorialMatch[] {
  const angle = options?.angle ?? null;
  const max = options?.max ?? MAX_EDITORIAL_MATCHES;
  const found: EditorialMatch[] = [];

  for (const post of posts) {
    const match = scorePublishedPost(subject, angle, post);
    if (match) {
      found.push(match);
    }
  }

  const kindRank: Record<RapprochementKind, number> = {
    probable_duplicate: 0,
    close: 1,
    complementary: 2,
  };

  found.sort(
    (left, right) =>
      kindRank[left.kind] - kindRank[right.kind] ||
      right.rankScore - left.rankScore
  );

  // Ne remplit pas artificiellement jusqu’à 5 : on coupe aux matches réels,
  // en écartant les complémentaires trop faibles si des proches existent.
  const hasStrong = found.some(
    (item) => item.kind === "probable_duplicate" || item.kind === "close"
  );
  const filtered = hasStrong
    ? found.filter(
        (item) =>
          item.kind !== "complementary" || item.rankScore >= EDITORIAL_THRESHOLDS.closeMin - 0.05
      )
    : found;

  const kept: EditorialMatch[] = [];
  const seen = new Set<number>();
  for (const match of filtered) {
    if (seen.has(match.wpPostId)) {
      continue;
    }
    seen.add(match.wpPostId);
    kept.push(match);
    if (kept.length >= max) {
      break;
    }
  }
  return kept;
}

export async function loadPublishedInventory(): Promise<{
  posts: PublishedPostRecord[];
  meta: EditorialInventoryMeta;
}> {
  const [diagnostic, posts] = await Promise.all([
    getWordPressInventoryDiagnostic(),
    db.wordPressPost.findMany({
      where: { status: "publish" },
      select: {
        wpPostId: true,
        title: true,
        slug: true,
        url: true,
        excerpt: true,
      },
      take: 2500,
    }),
  ]);

  const coverage = resolveInventoryCoverage({
    count: diagnostic.count,
    running: Boolean(diagnostic.running),
    truncated: false,
    lastSync: diagnostic.lastSync
      ? {
          status: diagnostic.lastSync.status,
          mode: diagnostic.lastSync.mode,
          expectedTotal: diagnostic.lastSync.expectedTotal,
          fetchedCount: diagnostic.lastSync.fetchedCount,
          diagnosticNote: diagnostic.lastSync.diagnosticNote,
        }
      : null,
  });

  const lastSyncAt =
    diagnostic.lastSync?.finishedAt?.toISOString() ??
    diagnostic.lastSync?.startedAt?.toISOString() ??
    null;

  const finishedAt = diagnostic.lastSync?.finishedAt;
  const inventoryStale =
    coverage.coverage !== "available" ||
    !finishedAt ||
    Date.now() - finishedAt.getTime() > INVENTORY_STALE_AFTER_MS;

  const published: PublishedPostRecord[] = posts
    .map((post) => ({
      wpPostId: post.wpPostId,
      title: decodeHtmlEntities(post.title),
      slug: post.slug,
      url: post.url,
      excerpt: post.excerpt ? decodeHtmlEntities(post.excerpt) : null,
    }))
    .filter((post) => httpUrl(post.url));

  return {
    posts: published,
    meta: {
      coverage: coverage.coverage as InventoryCoverage,
      coverageNote: coverage.coverageNote,
      verified: coverage.verified,
      lastSyncAt,
      inventoryStale,
      publishedCount: published.length,
    },
  };
}

export async function checkEditorialRapprochement(input: {
  subject: string;
  angle?: string | null;
}): Promise<EditorialRapprochementResult> {
  const { posts, meta } = await loadPublishedInventory();
  const matches =
    meta.publishedCount === 0
      ? []
      : findEditorialRapprochements(input.subject, posts, {
          angle: input.angle ?? null,
        });

  return {
    ...meta,
    subject: input.subject,
    matches,
    hasMatches: matches.length > 0,
  };
}

export function publicMatchView(match: EditorialMatch) {
  return {
    kind: match.kind,
    title: match.title,
    url: match.url,
    explanation: match.explanation,
    message: match.message,
    wpPostId: match.wpPostId,
  };
}

export {
  normalizeText,
  extractEditorialConcepts,
  extractEditorialIntentions,
};
export type { EditorialIntention };
