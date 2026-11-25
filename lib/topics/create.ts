import { logError } from "../logger";
import { normalizeArticleUrl } from "../veille/verify";
import type {
  DuplicateMatch,
  InventoryCoverage,
  ProposalInput,
} from "../veille/editorial-duplicates";

const MAX_SUBJECT_LENGTH = 500;
const MAX_ANGLE_LENGTH = 240;
const MAX_NOTES_LENGTH = 2000;
const MAX_CATEGORY_LENGTH = 120;
const MAX_SOURCE_TITLE_LENGTH = 180;
const MAX_SOURCE_NAME_LENGTH = 120;

const SOURCE_KINDS = new Set(["news", "study", "guide", "unknown"]);

export type TopicOrigin = "veille";

export type TopicCreateData = {
  subject: string;
  angle: string | null;
  notes: string | null;
  category: string | null;
  origin: TopicOrigin | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceName: string | null;
  sourcePublishedOn: string | null;
  sourceKind: string | null;
  webflowCategoryItemId?: string | null;
  webflowAuthorItemId?: string | null;
};

function optionalWebflowItemId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new TopicCreateError("Identifiant de référence Webflow invalide.", 400);
  }
  const cleaned = value.replace(/\u0000/g, "").trim();
  if (!cleaned) {
    return null;
  }
  if (cleaned.length < 8 || cleaned.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    throw new TopicCreateError("Identifiant de référence Webflow invalide.", 400);
  }
  return cleaned;
}

export type StoredTopic = TopicCreateData & {
  id: string;
  status: "pending";
  priority: number;
};

export type TopicStore = {
  findExactSource: (sourceUrl: string, subject: string) => Promise<StoredTopic | null>;
  create: (data: TopicCreateData) => Promise<StoredTopic>;
};

export class TopicCreateError extends Error {
  readonly status: number;
  readonly topicId?: string;

  constructor(message: string, status: number, topicId?: string) {
    super(message);
    this.name = "TopicCreateError";
    this.status = status;
    this.topicId = topicId;
  }
}

function text(
  value: unknown,
  field: string,
  max: number,
  required: boolean
): string | null {
  if (value === undefined || value === null) {
    if (required) {
      throw new TopicCreateError(`Le champ ${field} est obligatoire.`, 400);
    }
    return null;
  }
  if (typeof value !== "string") {
    throw new TopicCreateError(`Le champ ${field} est invalide.`, 400);
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    if (required) {
      throw new TopicCreateError(`Le champ ${field} est obligatoire.`, 400);
    }
    return null;
  }
  if (trimmed.length > max) {
    throw new TopicCreateError(`Le champ ${field} est trop long.`, 400);
  }
  return trimmed;
}

function calendarDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TopicCreateError("La date de publication est invalide.", 400);
  }
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new TopicCreateError("La date de publication est invalide.", 400);
  }
  return value;
}

export function parseTopicCreate(value: unknown): TopicCreateData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TopicCreateError("Corps JSON invalide.", 400);
  }
  const body = value as Record<string, unknown>;
  if (
    "status" in body ||
    "id" in body ||
    "agentId" in body ||
    "priority" in body
  ) {
    throw new TopicCreateError("Paramètre de création refusé.", 400);
  }

  const subject = text(body.subject, "sujet", MAX_SUBJECT_LENGTH, true);
  if (!subject) {
    throw new TopicCreateError("Le sujet est obligatoire.", 400);
  }

  const origin = body.origin;
  if (origin !== undefined && origin !== null && origin !== "veille") {
    throw new TopicCreateError("Origine de sujet inconnue.", 400);
  }
  const fromWatch = origin === "veille";
  if (!fromWatch && (body.sourceUrl !== undefined || body.sourceKind !== undefined)) {
    throw new TopicCreateError("Les métadonnées de source exigent l’origine veille.", 400);
  }

  const sourceUrl = fromWatch
    ? normalizeArticleUrl(typeof body.sourceUrl === "string" ? body.sourceUrl : "")
    : null;
  if (fromWatch && !sourceUrl) {
    throw new TopicCreateError("L’URL de la publication source est invalide.", 400);
  }

  const sourceKind = fromWatch ? text(body.sourceKind, "catégorie", 20, true) : null;
  if (fromWatch && (!sourceKind || !SOURCE_KINDS.has(sourceKind))) {
    throw new TopicCreateError("La catégorie de publication est invalide.", 400);
  }

  return {
    subject,
    angle: text(body.angle, "angle", MAX_ANGLE_LENGTH, false),
    notes: text(body.notes, "notes", MAX_NOTES_LENGTH, false),
    category: text(body.category, "thématique", MAX_CATEGORY_LENGTH, false),
    origin: fromWatch ? "veille" : null,
    sourceUrl,
    sourceTitle: fromWatch
      ? text(body.sourceTitle, "titre de la publication", MAX_SOURCE_TITLE_LENGTH, true)
      : null,
    sourceName: fromWatch
      ? text(body.sourceName, "source", MAX_SOURCE_NAME_LENGTH, true)
      : null,
    sourcePublishedOn: fromWatch ? calendarDate(body.sourcePublishedOn) : null,
    sourceKind,
    webflowCategoryItemId: optionalWebflowItemId(body.webflowCategoryItemId),
    webflowAuthorItemId: optionalWebflowItemId(body.webflowAuthorItemId),
  };
}

export function isUniqueTopicViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function createTopic(
  value: unknown,
  store: TopicStore
): Promise<StoredTopic> {
  const data = parseTopicCreate(value);
  if (data.sourceUrl) {
    const existing = await store.findExactSource(data.sourceUrl, data.subject);
    if (existing) {
      throw new TopicCreateError(
        "Un sujet identique existe déjà pour cette publication.",
        409,
        existing.id
      );
    }
  }
  try {
    return await store.create(data);
  } catch (error) {
    if (isUniqueTopicViolation(error)) {
      throw new TopicCreateError(
        "Un sujet identique existe déjà pour cette publication.",
        409
      );
    }
    throw error;
  }
}

export type TopicCreateResult = {
  status: number;
  body: {
    topic?: StoredTopic;
    error?: string;
    topicId?: string;
    code?: "exact_topic" | "similar";
    requiresConfirmation?: boolean;
    matches?: DuplicateMatch[];
    coverage?: InventoryCoverage;
    coverageNote?: string;
  };
};

export type VeilleDuplicateAssessment = {
  queueExact: boolean;
  similar: boolean;
  matches: DuplicateMatch[];
  coverage: InventoryCoverage;
  coverageNote: string;
};

export async function handleCreateTopic(
  request: Request,
  deps: {
    authenticated: boolean;
    store: TopicStore;
    assess?: (input: ProposalInput) => Promise<VeilleDuplicateAssessment>;
  }
): Promise<TopicCreateResult> {
  if (!deps.authenticated) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { status: 400, body: { error: "Corps JSON invalide." } };
  }
  const confirmSimilar =
    Boolean(payload) &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as { confirmSimilar?: unknown }).confirmSimilar === true;
  try {
    const data = parseTopicCreate(payload);
    if (data.origin === "veille" && deps.assess) {
      let assessment: VeilleDuplicateAssessment;
      try {
        assessment = await deps.assess({
          title: data.subject,
          angle: data.angle,
          intent: null,
        });
      } catch {
        return {
          status: 503,
          body: {
            error: "La vérification des doublons n’a pas abouti. Le sujet n’a pas été créé.",
          },
        };
      }
      if (assessment.queueExact) {
        return {
          status: 409,
          body: {
            error: "Ce titre est identique à un sujet déjà présent dans la file.",
            code: "exact_topic",
            requiresConfirmation: false,
            matches: assessment.matches,
            coverage: assessment.coverage,
            coverageNote: assessment.coverageNote,
          },
        };
      }
      if (assessment.similar && !confirmSimilar) {
        return {
          status: 409,
          body: {
            error: "Un sujet proche a été trouvé. Confirmez l’ajout pour continuer.",
            code: "similar",
            requiresConfirmation: true,
            matches: assessment.matches,
            coverage: assessment.coverage,
            coverageNote: assessment.coverageNote,
          },
        };
      }
    }
    const topic = await createTopic(payload, deps.store);
    return { status: 201, body: { topic } };
  } catch (error) {
    if (error instanceof TopicCreateError) {
      return {
        status: error.status,
        body: { error: error.message, topicId: error.topicId },
      };
    }
    const errorName = error instanceof Error ? error.name : "Error";
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    const clientVersion =
      typeof error === "object" && error !== null && "clientVersion" in error
        ? String((error as { clientVersion?: unknown }).clientVersion ?? "")
        : "";
    logError(
      "topics",
      `create failed name=${errorName} code=${errorCode} client=${clientVersion}`,
      { name: errorName, code: errorCode, clientVersion }
    );
    return { status: 500, body: { error: "Erreur serveur. Le sujet n'a pas été créé." } };
  }
}

export function topicCreateMessage(status: number, serverMessage?: string): string {
  if (status === 401) {
    return "Session expirée ou accès non autorisé.";
  }
  if (status === 409) {
    return "Ce sujet est déjà présent dans la file.";
  }
  if (status === 400) {
    if (
      serverMessage &&
      !/prisma|sql|stack|secret|password|token|select |insert /i.test(serverMessage)
    ) {
      return serverMessage;
    }
    return "Les données envoyées sont invalides.";
  }
  return "Erreur serveur. Le sujet n'a pas été créé.";
}
