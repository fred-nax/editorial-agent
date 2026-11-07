import { compareEditorialSimilarity, nearlyIdenticalText } from "../seo/editorial-similarity";
import { jaccardSimilarity, normalizeText, slugify, tokenize } from "../seo/normalize";
import { compareTitleSimilarity } from "../seo/similarity";

const MAX_PROPOSALS = 3;
const MAX_TITLE = 500;
const MAX_ANGLE = 240;
const MAX_INTENT = 160;
const MAX_MATCHES = 3;

const GENERIC_TERMS = new Set([
  "agent",
  "agents",
  "ia",
  "intelligence",
  "artificielle",
  "artificiel",
  "entreprise",
  "entreprises",
  "pme",
  "pmes",
  "guide",
  "analyse",
  "article",
  "sujet",
  "usage",
  "usages",
  "solution",
  "solutions",
  "outil",
  "outils",
  "technologie",
  "numerique",
  "digital",
]);

export type DuplicateLevel = "exact" | "similar" | "none";
export type DuplicateSource = "wordpress" | "topic" | "generation";
export type InventoryCoverage = "available" | "partial" | "unavailable";

export type ProposalInput = {
  title: string;
  angle: string | null;
  intent: string | null;
};

export type DuplicateMatch = {
  level: "exact" | "similar";
  source: DuplicateSource;
  title: string;
  url: string | null;
  explanation: string;
  wpPostId: number | null;
  topicId: string | null;
};

export type ProposalDuplicateResult = {
  level: DuplicateLevel;
  matches: DuplicateMatch[];
};

export type DuplicateCheckBody = {
  coverage: InventoryCoverage;
  coverageNote: string;
  verified: boolean;
  results: ProposalDuplicateResult[];
};

type SyncSnapshot = {
  count: number;
  running: boolean;
  truncated: boolean;
  lastSync: {
    status: string;
    mode: string;
    expectedTotal: number | null;
    fetchedCount: number;
    diagnosticNote: string | null;
  } | null;
};

export type CorpusRecord = {
  source: DuplicateSource;
  title: string;
  subject: string;
  angle: string | null;
  intent: string | null;
  url: string | null;
  slug: string | null;
  wpPostId: number | null;
  topicId: string | null;
  generationTopicId: string | null;
};

export type EditorialCorpus = {
  records: CorpusRecord[];
  coverage: InventoryCoverage;
  coverageNote: string;
  verified: boolean;
};

export function resolveInventoryCoverage(snapshot: SyncSnapshot): {
  coverage: InventoryCoverage;
  coverageNote: string;
  verified: boolean;
} {
  const sync = snapshot.lastSync;
  if ((!sync || sync.status === "failed") && snapshot.count === 0) {
    return {
      coverage: "unavailable",
      coverageNote: "Aucun inventaire WordPress exploitable. L’originalité du sujet n’est pas établie.",
      verified: false,
    };
  }
  const reasons: string[] = [];
  if (!sync) {
    reasons.push("aucune synchronisation n’est enregistrée");
  } else if (sync.status === "failed") {
    reasons.push("la dernière synchronisation a échoué");
  } else if (sync.status === "running" || snapshot.running) {
    reasons.push("une synchronisation est en cours");
  }
  if (
    sync &&
    sync.expectedTotal !== null &&
    sync.expectedTotal > sync.fetchedCount
  ) {
    reasons.push(
      `${sync.expectedTotal} articles annoncés, ${sync.fetchedCount} récupérés`
    );
  }
  if (sync?.mode === "incremental") {
    reasons.push("la dernière synchronisation est incrémentale");
  }
  if (sync?.diagnosticNote && /incoh[ée]rence|écart/i.test(sync.diagnosticNote)) {
    reasons.push("l’écart signalé par la synchronisation reste ouvert");
  }
  if (snapshot.truncated) {
    reasons.push("le corpus comparé a atteint sa limite de lecture");
  }
  if (
    sync?.status === "completed" &&
    sync.mode === "full" &&
    reasons.length === 0 &&
    sync.expectedTotal !== null &&
    sync.expectedTotal <= sync.fetchedCount
  ) {
    return {
      coverage: "available",
      coverageNote: "Inventaire WordPress disponible pour la comparaison locale.",
      verified: true,
    };
  }
  if (reasons.length === 0 && snapshot.count === 0) {
    return {
      coverage: "unavailable",
      coverageNote: "Aucun inventaire WordPress exploitable. L’originalité du sujet n’est pas établie.",
      verified: false,
    };
  }
  return {
    coverage: "partial",
    coverageNote: `Vérification partielle : ${reasons.join(" ; ") || "la couverture complète n’est pas démontrée"}. L’originalité du sujet n’est pas établie.`,
    verified: true,
  };
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > max) {
    return null;
  }
  return cleaned;
}

export function parseDuplicateProposals(
  value: unknown
): { ok: true; proposals: ProposalInput[] } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Corps JSON invalide." };
  }
  const proposals = (value as { proposals?: unknown }).proposals;
  if (!Array.isArray(proposals) || proposals.length < 1 || proposals.length > MAX_PROPOSALS) {
    return { ok: false, error: "Indiquez une à trois propositions." };
  }
  const parsed: ProposalInput[] = [];
  for (const item of proposals) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "Une proposition est invalide." };
    }
    const record = item as Record<string, unknown>;
    const title = clean(record.title, MAX_TITLE);
    if (!title) {
      return { ok: false, error: "Chaque proposition doit avoir un titre exploitable." };
    }
    const angle = record.angle == null || record.angle === "" ? null : clean(record.angle, MAX_ANGLE);
    const intent =
      record.intent == null || record.intent === "" ? null : clean(record.intent, MAX_INTENT);
    if ((record.angle != null && record.angle !== "" && !angle) || (record.intent != null && record.intent !== "" && !intent)) {
      return { ok: false, error: "L’angle ou l’intention dépasse la taille autorisée." };
    }
    parsed.push({ title, angle, intent });
  }
  return { ok: true, proposals: parsed };
}

function termKey(token: string): string {
  return token.length > 6 ? token.slice(0, 6) : token;
}

function distinctiveKeys(value: string): string[] {
  const keys = tokenize(value)
    .filter((token) => !GENERIC_TERMS.has(token))
    .map(termKey);
  return [...new Set(keys)];
}

function sharedTerms(left: string, right: string): { terms: string[]; overlap: number } {
  const leftKeys = distinctiveKeys(left);
  const rightKeys = distinctiveKeys(right);
  const rightSet = new Set(rightKeys);
  return {
    terms: leftKeys.filter((key) => rightSet.has(key)),
    overlap: jaccardSimilarity(leftKeys, rightKeys),
  };
}

function wordCount(value: string): number {
  return normalizeText(value).split(" ").filter(Boolean).length;
}

function isExactTitle(proposalTitle: string, record: CorpusRecord): boolean {
  if (
    nearlyIdenticalText(proposalTitle, record.title) ||
    compareTitleSimilarity(proposalTitle, record.title).score === 1
  ) {
    return true;
  }
  if (record.source !== "wordpress" && nearlyIdenticalText(proposalTitle, record.subject)) {
    return true;
  }
  if (record.slug && slugify(proposalTitle) === record.slug) {
    return true;
  }
  return false;
}

function explanation(
  level: "exact" | "similar",
  editorial: ReturnType<typeof compareEditorialSimilarity>,
  shared: string[]
): string {
  if (level === "exact") {
    return "Le titre normalisé est identique à un titre ou à un sujet déjà enregistré.";
  }
  const parts: string[] = [];
  if (editorial.titleScore >= 0.55) {
    parts.push("les titres se recouvrent fortement");
  }
  if (editorial.angleScore >= 0.62) {
    parts.push("les angles décrivent le même traitement");
  }
  if (editorial.intentScore >= 0.62) {
    parts.push("les intentions de recherche se recouvrent");
  }
  if (shared.length > 0) {
    parts.push(`termes spécifiques communs : ${shared.slice(0, 5).join(", ")}`);
  }
  return parts.length > 0
    ? `${parts.join(" ; ")}.`
    : "La proximité porte sur le problème traité, au-delà d’une thématique commune.";
}

function pairLevel(
  proposal: ProposalInput,
  record: CorpusRecord
): { level: DuplicateLevel; score: number; explanation: string } | null {
  const editorial = compareEditorialSimilarity(
    {
      title: proposal.title,
      subject: proposal.title,
      angle: proposal.angle,
      searchIntent: proposal.intent,
    },
    {
      title: record.title,
      subject: record.subject,
      angle: record.angle,
      searchIntent: record.intent,
    }
  );
  if (isExactTitle(proposal.title, record)) {
    return {
      level: "exact",
      score: 1,
      explanation: explanation("exact", editorial, []),
    };
  }
  const shared = sharedTerms(
    `${proposal.title} ${proposal.angle ?? ""} ${proposal.intent ?? ""}`,
    `${record.title} ${record.subject} ${record.angle ?? ""} ${record.intent ?? ""}`
  ).terms;
  const intentsDiffer =
    Boolean(proposal.intent && record.intent) &&
    editorial.intentScore < 0.35 &&
    editorial.titleScore < 0.62;
  if (intentsDiffer) {
    return null;
  }
  const shorterWords = Math.min(wordCount(proposal.title), wordCount(record.title));
  const strongInclusion = editorial.titleScore >= 0.85 && shorterWords >= 4;
  const strongComponents =
    editorial.titleScore >= 0.62 ||
    editorial.angleScore >= 0.62 ||
    editorial.intentScore >= 0.62;
  const similar =
    (shared.length >= 2 && (editorial.score >= 0.62 || strongComponents)) ||
    ((editorial.angleScore >= 0.62 || editorial.intentScore >= 0.62) &&
      shared.length >= 1 &&
      editorial.titleScore >= 0.35) ||
    strongInclusion;
  if (!similar) {
    return null;
  }
  return {
    level: "similar",
    score: editorial.score,
    explanation: explanation("similar", editorial, shared),
  };
}

export function checkProposals(
  proposals: ProposalInput[],
  corpus: EditorialCorpus
): ProposalDuplicateResult[] {
  return proposals.map((proposal) => {
    const found: Array<DuplicateMatch & { score: number; rank: number }> = [];
    corpus.records.forEach((record, index) => {
      const match = pairLevel(proposal, record);
      if (!match || match.level === "none") {
        return;
      }
      found.push({
        level: match.level,
        source: record.source,
        title: record.title,
        url: record.url,
        explanation: match.explanation,
        wpPostId: record.wpPostId,
        topicId: record.source === "topic" ? record.topicId : record.generationTopicId,
        score: match.score,
        rank: index,
      });
    });
    found.sort((left, right) => {
      if (left.level !== right.level) {
        return left.level === "exact" ? -1 : 1;
      }
      return right.score - left.score || left.rank - right.rank;
    });
    const kept: DuplicateMatch[] = [];
    const seenPosts = new Set<number>();
    const seenTopics = new Set<string>();
    for (const match of found) {
      if (match.wpPostId !== null) {
        if (seenPosts.has(match.wpPostId)) {
          continue;
        }
        seenPosts.add(match.wpPostId);
      }
      if (match.source === "generation" && match.topicId && seenTopics.has(match.topicId)) {
        continue;
      }
      if (match.source === "topic" && match.topicId) {
        seenTopics.add(match.topicId);
      }
      kept.push({
        level: match.level,
        source: match.source,
        title: match.title,
        url: match.url,
        explanation: match.explanation,
        wpPostId: match.wpPostId,
        topicId: match.topicId,
      });
      if (kept.length === MAX_MATCHES) {
        break;
      }
    }
    const level: DuplicateLevel = kept.some((match) => match.level === "exact")
      ? "exact"
      : kept.length > 0
        ? "similar"
        : "none";
    return { level, matches: kept };
  });
}

export function queueHasExact(result: ProposalDuplicateResult): boolean {
  return result.matches.some((match) => match.level === "exact" && match.source === "topic");
}

export function hasSimilar(result: ProposalDuplicateResult): boolean {
  return result.matches.some((match) => match.level === "similar");
}

export type DuplicateHandlerResult = {
  status: number;
  body: Partial<DuplicateCheckBody> & { error?: string };
};

export async function handleCheckDuplicates(
  request: Request,
  deps: { authenticated: boolean; load: () => Promise<EditorialCorpus> }
): Promise<DuplicateHandlerResult> {
  if (!deps.authenticated) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { status: 400, body: { error: "Corps JSON invalide." } };
  }
  const parsed = parseDuplicateProposals(payload);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }
  try {
    const corpus = await deps.load();
    return {
      status: 200,
      body: {
        coverage: corpus.coverage,
        coverageNote: corpus.coverageNote,
        verified: corpus.verified,
        results: checkProposals(parsed.proposals, corpus),
      },
    };
  } catch {
    return {
      status: 503,
      body: {
        error: "La vérification des doublons n’a pas abouti.",
        verified: false,
        coverage: "unavailable",
        coverageNote: "Vérification indisponible. L’originalité du sujet n’est pas établie.",
      },
    };
  }
}
