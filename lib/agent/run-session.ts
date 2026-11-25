import { inspect } from "node:util";
import { resolveEditorialIdentity } from "../editorial/identity";
import { logInfo } from "../logger";
import { estimateLlmCostUsd } from "../openai-pricing";
import {
  parseTokenUsage,
  type TokenUsageSnapshot,
} from "../openai-usage";
import {
  PROGRESS_MESSAGES,
  type AgentProgressEvent,
  type GenerationStage,
} from "../progress";
import type OpenAI from "openai";
import { createOpenAIClient } from "../openai";
import {
  resolveOpenAiConfig,
  resolveRuntimeConnections,
  resolveWordPressCategoryConfig,
} from "../settings/app-settings";
import { normalizeWpOrigin } from "../settings/wp-url";
import {
  isDynamicCategoryMode,
  resolveCategoriesForSubject,
  sanitizeCategoryIdsForWordPress,
} from "../wordpress-categories";
import { getCmsConnector, normalizeCmsDestination } from "../cms";
import type { CmsDestinationId } from "../cms/types";
import { resolveEditorialAgentForDestination } from "./registry";
import { CREATE_WORDPRESS_DRAFT_TOOL_NAME } from "./tools";
import {
  CREATE_WEBFLOW_DRAFT_TOOL_NAME,
  parseWebflowDraftArgs,
} from "./webflow-draft-tool";
import { normalizeWpSeoPlugin } from "../wordpress-seo";
import {
  type WordPressDraftInput,
  type WordPressDraftResult,
} from "../wordpress";
import {
  buildInternalLinkPlan,
  sanitizeInternalLinks,
} from "./internal-links";
import type { InternalLinkPlan } from "./internal-links/types";
import {
  attachObservedEvents,
  createEventTraceState,
  eventTraceFromState,
  observeAgentEvent,
  type GenerationEventTrace,
} from "../generation-trace";
import { buildArticlePrompt } from "./prompt";
import { getWebflowGenerationReadiness } from "../webflow/readiness";
import { checkEditorialRapprochement } from "../topics/editorial-similarity";
import { formatEditorialGenerationHints } from "../topics/editorial-generation-hints";

function siteHostFromWpUrl(wpUrl: string, fallbackHost: string): string {
  try {
    return new URL(wpUrl).hostname.replace(/^www\./, "");
  } catch {
    return fallbackHost;
  }
}

export type AgentSessionLog = (message: string) => void;

export type AgentProgressHandler = (
  progress: AgentProgressEvent
) => void | Promise<void>;

export type RunAgentSessionOptions = {
  onLog?: AgentSessionLog;
  onProgress?: AgentProgressHandler;
  /** Message ponctuel. Absent : le sujet seul, comme aujourd'hui. */
  generationMessage?: string;
  /**
   * Destination CMS de la génération (persistée sur ArticleGeneration).
   * Défaut wordpress. Détermine l’agent OpenAI et les outils autorisés.
   */
  cmsDestination?: string | null;
  /**
   * Espace figé (génération) — requis pour maillage / indices Webflow.
   * Jamais lu depuis le cookie UI.
   */
  workspaceId?: string;
  /** Références Webflow figées au lancement (validées serveur avant OpenAI). */
  webflowCategoryItemId?: string | null;
  webflowAuthorItemId?: string | null;
};

export type RunAgentSessionCmsResult = {
  destination: CmsDestinationId;
  externalId: string;
  status: string;
  title: string;
  /** Vide pour Webflow (pas d’URL d’édition inventée). */
  link: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  excerpt: string;
};

export type RunAgentSessionResult = {
  success: true;
  sessionId: string;
  subject: string;
  cmsDestination: CmsDestinationId;
  /** Résultat CMS normalisé (WordPress ou Webflow). */
  cms: RunAgentSessionCmsResult;
  /**
   * Présent uniquement pour WordPress (rétrocompat génération + UI historiques).
   * Null pour Webflow — ne jamais inventer de wpPostId.
   */
  wordpress: {
    postId: number;
    status: string;
    title: string;
    link: string;
    categories: number[];
    metaTitle: string;
    metaDescription: string;
    slug: string;
    excerpt: string;
  } | null;
  detectedCategories: Array<{
    categoryId: number;
    name: string;
  }>;
  /** Modèle exact retourné par session.agent.model ; null si indisponible. */
  model: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  /** Coût LLM estimé (USD) ; null si modèle sans tarif officiel. Hors tools. */
  estimatedCost: number | null;
  /** Événements observés pendant le flux. Absent sur un double de test. */
  trace?: GenerationEventTrace;
  /** Métadonnées de récupération différée de usage (observabilité). */
  usageCollection: {
    source: "session" | "turns_sum" | null;
    attempt: number;
    retries: number;
    delayMs: number;
    raw: Record<string, unknown> | null;
  };
};

export class AgentSessionError extends Error {
  readonly sessionId: string | null;
  readonly code:
    | "turn_failed"
    | "turn_cancelled"
    | "no_draft"
    | "missing_session"
    | "tool_not_allowed_for_cms"
    | "tool_not_allowed_for_agent";

  constructor(
    message: string,
    code: AgentSessionError["code"],
    sessionId: string | null = null
  ) {
    super(message);
    this.name = "AgentSessionError";
    this.code = code;
    this.sessionId = sessionId;
  }
}

function log(onLog: AgentSessionLog | undefined, message: string): void {
  onLog?.(message);
}

async function emitProgress(
  onProgress: AgentProgressHandler | undefined,
  stage: GenerationStage,
  message: string
): Promise<void> {
  if (!onProgress) {
    return;
  }

  try {
    await onProgress({ stage, message });
  } catch {
    // L'observation ne doit jamais interrompre le moteur éditorial.
  }
}

function sessionItemType(event: { type: string; item?: { type?: string } }): string | null {
  if (
    event.type !== "agent.session.turn.item.added" &&
    event.type !== "agent.session.turn.item.done"
  ) {
    return null;
  }
  return event.item?.type ?? null;
}

function parseDraftArgs(raw: unknown): WordPressDraftInput {
  const args = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!args || typeof args !== "object") {
    throw new Error("Arguments create_wordpress_draft invalides");
  }

  const record = args as Record<string, unknown>;

  return {
    title: String(record.title ?? ""),
    content: String(record.content ?? ""),
    excerpt: String(record.excerpt ?? ""),
    slug: String(record.slug ?? ""),
    meta_title: String(record.meta_title ?? ""),
    meta_description: String(record.meta_description ?? ""),
  };
}

function toCallerResult(
  result: WordPressDraftResult,
  draft: Pick<WordPressDraftInput, "slug" | "excerpt">
): RunAgentSessionResult["wordpress"] {
  return {
    postId: result.post_id,
    status: result.status,
    title: result.title,
    link: result.link,
    categories: result.categories,
    metaTitle: result.meta_title,
    metaDescription: result.meta_description,
    slug: draft.slug ?? "",
    excerpt: draft.excerpt ?? "",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SessionUsageCollection = {
  model: string | null;
  usage: TokenUsageSnapshot | null;
  source: "session" | "turns_sum" | null;
  /** Tentative réussie (1 = immédiat, sans attendre). */
  attempt: number;
  /** Délai depuis le début du polling jusqu'à l'apparition de usage (ms). */
  delayMs: number;
  retries: number;
};

/**
 * Prefer session.usage (cumulatif session, pas de double comptage).
 * Fallback : somme des turn.usage (chaque turn une fois).
 * usage arrive souvent en différé après turn.completed → polling court.
 * Aucun calcul de coût.
 */
async function collectSessionUsage(
  sessionId: string,
  client: OpenAI
): Promise<SessionUsageCollection> {
  const maxAttempts = 16;
  const delayBetweenAttemptsMs = 2000;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await client.beta.agents.sessions.retrieve(sessionId);
    const model =
      typeof session.agent?.model === "string" && session.agent.model.trim()
        ? session.agent.model.trim()
        : null;

    const sessionUsage = parseTokenUsage(session.usage);
    if (sessionUsage) {
      const delayMs = Date.now() - startedAt;
      const retries = Math.max(0, attempt - 1);
      logInfo("agent", "usage collected", {
        source: "session",
        attempt,
        retries,
        delayMs,
        model,
        inputTokens: sessionUsage.inputTokens,
        outputTokens: sessionUsage.outputTokens,
        totalTokens: sessionUsage.totalTokens,
        cachedInputTokens: sessionUsage.cachedInputTokens,
        reasoningTokens: sessionUsage.reasoningTokens,
      });
      return {
        model,
        usage: sessionUsage,
        source: "session",
        attempt,
        delayMs,
        retries,
      };
    }

    let turnsSum: TokenUsageSnapshot | null = null;
    let turnsWithUsage = 0;
    let turnsRaw: Record<string, unknown> | null = null;
    const turns = await client.beta.agents.sessions.turns.list(sessionId, {
      order: "asc",
    });
    for await (const turn of turns) {
      const turnUsage = parseTokenUsage(turn.usage);
      if (!turnUsage) {
        continue;
      }
      turnsWithUsage += 1;
      if (!turnsSum) {
        turnsSum = { ...turnUsage };
        turnsRaw = turnUsage.raw;
      } else {
        turnsSum = {
          inputTokens: turnsSum.inputTokens + turnUsage.inputTokens,
          outputTokens: turnsSum.outputTokens + turnUsage.outputTokens,
          totalTokens: turnsSum.totalTokens + turnUsage.totalTokens,
          cachedInputTokens:
            turnsSum.cachedInputTokens + turnUsage.cachedInputTokens,
          reasoningTokens:
            turnsSum.reasoningTokens + turnUsage.reasoningTokens,
          raw: {
            summed: true,
            turnsWithUsage: turnsWithUsage,
            last: turnUsage.raw,
          },
        };
        turnsRaw = turnsSum.raw;
      }
    }

    if (turnsSum && turnsWithUsage > 0) {
      const delayMs = Date.now() - startedAt;
      const retries = Math.max(0, attempt - 1);
      if (turnsRaw) {
        turnsSum.raw = turnsRaw;
      }
      logInfo("agent", "usage collected", {
        source: "turns_sum",
        attempt,
        retries,
        delayMs,
        model,
        turnsWithUsage,
        inputTokens: turnsSum.inputTokens,
        outputTokens: turnsSum.outputTokens,
        totalTokens: turnsSum.totalTokens,
        cachedInputTokens: turnsSum.cachedInputTokens,
        reasoningTokens: turnsSum.reasoningTokens,
      });
      return {
        model,
        usage: turnsSum,
        source: "turns_sum",
        attempt,
        delayMs,
        retries,
      };
    }

    if (attempt < maxAttempts) {
      await sleep(delayBetweenAttemptsMs);
    } else {
      const delayMs = Date.now() - startedAt;
      logInfo("agent", "usage unavailable", {
        attempt,
        retries: maxAttempts - 1,
        delayMs,
        model,
      });
      return {
        model,
        usage: null,
        source: null,
        attempt,
        delayMs,
        retries: maxAttempts - 1,
      };
    }
  }

  return {
    model: null,
    usage: null,
    source: null,
    attempt: 0,
    delayMs: 0,
    retries: 0,
  };
}

export async function runAgentSession(
  subject: string,
  options: RunAgentSessionOptions = {}
): Promise<RunAgentSessionResult> {
  const trimmedSubject = subject.trim();

  if (!trimmedSubject) {
    throw new Error("Sujet manquant.");
  }

  const { onLog, onProgress } = options;
  const observedEventTypes = new Set<string>();
  const observedItemTypes = new Set<string>();
  const eventTrace = createEventTraceState();
  let sawWebSearch = false;
  let emittedCombinedWork = false;
  let emittedWriting = false;

  // Snapshot figé pour toute la génération (changement Paramètres mid-flight ignoré).
  const cmsDestination = normalizeCmsDestination(options.cmsDestination);
  const editorialAgent =
    await resolveEditorialAgentForDestination(cmsDestination);

  let webflowCategoryItemId: string | null = null;
  let webflowAuthorItemId: string | null = null;

  if (cmsDestination === "webflow") {
    const readiness = await getWebflowGenerationReadiness();
    if (!readiness.ok) {
      throw new Error(
        `Webflow non prêt pour la génération : ${readiness.reasons.join(" ")}`
      );
    }

    // Validation des références CMS avant tout appel OpenAI payant.
    if (options.workspaceId) {
      const { resolveWebflowConfig } = await import(
        "@/lib/settings/app-settings"
      );
      const { resolveWebflowRefsWithDefaults } = await import(
        "@/lib/webflow/references-validate"
      );
      const { loadWorkspaceCmsSettings, getWorkspaceByIdOrSlug } = await import(
        "@/lib/workspace"
      );
      const { createWebflowClient } = await import("@/lib/webflow/client");
      const { discoverWebflowReferenceTargets } = await import(
        "@/lib/webflow/references-discover"
      );
      const config = await resolveWebflowConfig();
      const workspace = await getWorkspaceByIdOrSlug(options.workspaceId);
      const settings = workspace
        ? await loadWorkspaceCmsSettings(workspace)
        : null;
      let categoryRequired = false;
      let authorRequired = false;
      if (config?.apiToken && config.siteId && config.collectionId) {
        try {
          const client = createWebflowClient({ apiToken: config.apiToken });
          const discovery = await discoverWebflowReferenceTargets({
            client,
            siteId: config.siteId,
            blogCollectionId: config.collectionId,
            mapping: config.fieldMapping ?? {},
          });
          categoryRequired = Boolean(
            discovery.targets.find((t) => t.kind === "category")?.isRequired
          );
          authorRequired = Boolean(
            discovery.targets.find((t) => t.kind === "author")?.isRequired
          );
        } catch {
          // Découverte échouée : validation des IDs sélectionnés reste stricte.
        }
      }
      try {
        const validated = await resolveWebflowRefsWithDefaults({
          workspaceId: options.workspaceId,
          mapping: config?.fieldMapping ?? {},
          categoryItemId: options.webflowCategoryItemId,
          authorItemId: options.webflowAuthorItemId,
          defaultCategoryItemId: settings?.webflowDefaultCategoryItemId,
          defaultAuthorItemId: settings?.webflowDefaultAuthorItemId,
          categoryRequired,
          authorRequired,
        });
        webflowCategoryItemId = validated.categoryItemId;
        webflowAuthorItemId = validated.authorItemId;
        if (validated.categoryName) {
          log(onLog, `Catégorie Webflow : ${validated.categoryName}`);
        }
        if (validated.authorName) {
          log(onLog, `Auteur Webflow : ${validated.authorName}`);
        }
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : "Références Webflow invalides."
        );
      }
    }
  }

  const openaiConfig = await resolveOpenAiConfig();
  if (!openaiConfig?.apiKey) {
    throw new Error("Clé API OpenAI manquante.");
  }
  const openai = createOpenAIClient(openaiConfig.apiKey);

  // WordPress credentials uniquement pour destination WordPress (pas de fallback).
  const connections =
    cmsDestination === "wordpress" ? await resolveRuntimeConnections() : null;
  const wordpressCredentials = connections?.wordpress ?? null;

  const identity = resolveEditorialIdentity({
    wpUrl: wordpressCredentials?.url ?? null,
    siteName: connections?.siteName ?? null,
    clientName: connections?.clientName ?? null,
  });

  let detectedCategories: Array<{ categoryId: number; name: string }> = [];
  let categoryIds: number[] = [];

  if (cmsDestination === "wordpress" && wordpressCredentials) {
    const categoryConfig = await resolveWordPressCategoryConfig();
    const effectiveWpOrigin = normalizeWpOrigin(wordpressCredentials.url);
    const dynamicCategoryMode = isDynamicCategoryMode(
      categoryConfig,
      effectiveWpOrigin
    );
    detectedCategories = resolveCategoriesForSubject({
      subject: trimmedSubject,
      isNaxialisLegacy: identity.isNaxialisLegacy,
      config: categoryConfig,
      effectiveWpOrigin,
    });
    categoryIds = sanitizeCategoryIdsForWordPress({
      ids: detectedCategories.map((category) => category.categoryId),
      allowedIds: categoryConfig?.allowedIds ?? [],
      categories: categoryConfig?.categories ?? [],
      categoriesOrigin: categoryConfig?.origin ?? null,
      effectiveWpOrigin,
      dynamicMode: dynamicCategoryMode,
    });
  }

  await emitProgress(
    onProgress,
    "preparing",
    PROGRESS_MESSAGES.preparing
  );

  log(onLog, "");
  log(onLog, `Sujet : ${trimmedSubject}`);

  if (detectedCategories.length > 0) {
    log(
      onLog,
      `Catégories détectées : ${detectedCategories
        .map((category) => `${category.name} (${category.categoryId})`)
        .join(", ")}`
    );
  }

  let linkPlan: InternalLinkPlan;
  let allowedInternalUrls: string[] = [];
  let wpHost = identity.siteHost;

  if (cmsDestination === "wordpress" && wordpressCredentials) {
    log(onLog, "");
    log(onLog, "Préparation du maillage interne…");
    try {
      linkPlan = await buildInternalLinkPlan(trimmedSubject);
    } catch (error) {
      log(
        onLog,
        `Maillage : inventaire indisponible (${error instanceof Error ? error.message : "erreur"}) — aucun lien interne autorisé.`
      );
      linkPlan = {
        subject: trimmedSubject,
        themes: [],
        catalogSize: 0,
        catalogStale: true,
        candidates: [],
        selected: [],
        rejected: [],
        minScore: 0.28,
        maxLinks: 4,
      };
    }

    if (linkPlan.catalogStale) {
      log(
        onLog,
        "Maillage : inventaire WordPress potentiellement périmé — lancer une sync SEO si besoin."
      );
    }
    log(
      onLog,
      `Maillage : ${linkPlan.selected.length} destination(s) autorisée(s) sur ${linkPlan.catalogSize} publiée(s).`
    );
    for (const item of linkPlan.selected) {
      log(
        onLog,
        `  • ${item.title} (${Math.round(item.score * 100)} %) — ${item.url}`
      );
    }
    allowedInternalUrls = linkPlan.selected.map((item) => item.url);
    wpHost = siteHostFromWpUrl(wordpressCredentials.url, identity.siteHost);
  } else {
    // Webflow : maillage uniquement via inventaire Webflow (URL live confirmées).
    log(onLog, "");
    log(onLog, "Préparation du maillage interne Webflow…");
    const frozenWorkspaceId = options.workspaceId;
    if (!frozenWorkspaceId) {
      log(
        onLog,
        "Maillage Webflow : workspaceId absent — aucun lien interne autorisé."
      );
      linkPlan = {
        subject: trimmedSubject,
        themes: [],
        catalogSize: 0,
        catalogStale: true,
        candidates: [],
        selected: [],
        rejected: [],
        minScore: 0.28,
        maxLinks: 0,
      };
    } else {
      try {
        linkPlan = await buildInternalLinkPlan(trimmedSubject, {
          workspaceId: frozenWorkspaceId,
          cmsProvider: "webflow",
        });
        log(
          onLog,
          `Maillage Webflow : ${linkPlan.selected.length} destination(s) autorisée(s) sur ${linkPlan.catalogSize} publiée(s) live.`
        );
        for (const item of linkPlan.selected) {
          log(
            onLog,
            `  • ${item.title} (${Math.round(item.score * 100)} %) — ${item.url}`
          );
        }
        allowedInternalUrls = linkPlan.selected.map((item) => item.url);
      } catch (error) {
        log(
          onLog,
          `Maillage Webflow indisponible (${error instanceof Error ? error.message : "erreur"}) — aucun lien.`
        );
        linkPlan = {
          subject: trimmedSubject,
          themes: [],
          catalogSize: 0,
          catalogStale: true,
          candidates: [],
          selected: [],
          rejected: [],
          minScore: 0.28,
          maxLinks: 0,
        };
      }
    }
  }

  log(onLog, "");
  log(
    onLog,
    `Agent éditorial : ${editorialAgent.label} (${editorialAgent.agentIdSource})`
  );
  log(onLog, `Destination CMS : ${cmsDestination}`);
  const sessionToolNames = editorialAgent.tools.map((tool) =>
    tool.type === "function" ? tool.name : tool.type
  );
  log(onLog, `Outils session : ${sessionToolNames.join(", ")}`);
  log(onLog, "Création de la session...");

  // WordPress : l’agent registre doit coincider avec RuntimeConnections.
  if (
    cmsDestination === "wordpress" &&
    connections &&
    editorialAgent.agentId !== connections.openai.agentId
  ) {
    throw new Error(
      "Incohérence agent WordPress entre le registre éditorial et RuntimeConnections."
    );
  }

  let inventoryHintsBlock: string | null = null;
  if (cmsDestination === "webflow" && options.workspaceId) {
    try {
      const rapprochement = await checkEditorialRapprochement({
        subject: trimmedSubject,
        workspaceId: options.workspaceId,
      });
      inventoryHintsBlock = formatEditorialGenerationHints({
        rapprochements: rapprochement.matches,
        linkPlan,
        inventoryNote: rapprochement.coverageNote,
      });
      log(
        onLog,
        `Contexte inventaire Webflow : ${rapprochement.matches.length} rapprochement(s), ${linkPlan.selected.length} lien(s) autorisé(s).`
      );
    } catch (error) {
      log(
        onLog,
        `Contexte inventaire Webflow indisponible (${error instanceof Error ? error.message : "erreur"}).`
      );
    }
  }

  const articlePrompt = buildArticlePrompt(
    options.generationMessage?.trim() || trimmedSubject,
    linkPlan,
    identity,
    cmsDestination,
    inventoryHintsBlock
  );

  const stream = await openai.beta.agents.sessions.create({
    agent_id: editorialAgent.agentId,
    agent: {
      tools: editorialAgent.tools,
    },
    environment: {
      type: "none",
    },
    input: articlePrompt,
    stream: true,
  });

  let sessionId: string | null = null;
  let wordpressResult: WordPressDraftResult | null = null;
  let cmsResultNormalized: RunAgentSessionCmsResult | null = null;
  let draftMeta: Pick<WordPressDraftInput, "slug" | "excerpt"> = {
    slug: "",
    excerpt: "",
  };
  /** Dernier texte assistant (diagnostic only — jamais utilisé pour créer un brouillon). */
  let lastAssistantTextPreview = "";

  try {
    for await (const event of stream) {
      observeAgentEvent(eventTrace, event);
      observedEventTypes.add(event.type);
      const itemType = sessionItemType(event);
      if (itemType) {
        observedItemTypes.add(itemType);
      }

      if (
        event.type !== "agent.session.turn.output_text.delta" &&
        event.type !== "agent.session.turn.reasoning_summary_text.delta"
      ) {
        log(onLog, `EVENT : ${event.type}`);
      }

      if (event.type === "agent.session.created") {
        sessionId = event.session.id;
        log(onLog, `Session : ${sessionId}`);
        await emitProgress(
          onProgress,
          "preparing",
          PROGRESS_MESSAGES.sessionReady
        );
      }

      if (itemType === "web_search_call") {
        sawWebSearch = true;
        await emitProgress(
          onProgress,
          "researching",
          PROGRESS_MESSAGES.researching
        );
      }

      if (
        event.type === "agent.session.turn.output_text.delta" ||
        event.type === "agent.session.turn.output_text.done"
      ) {
        if (sawWebSearch) {
          if (!emittedWriting) {
            emittedWriting = true;
            await emitProgress(
              onProgress,
              "writing",
              PROGRESS_MESSAGES.writing
            );
          }
        } else if (!emittedCombinedWork) {
          emittedCombinedWork = true;
          await emitProgress(
            onProgress,
            "researching",
            PROGRESS_MESSAGES.researchingAndWriting
          );
        }
      }

      if (event.type === "agent.session.turn.output_text.done") {
        const text = typeof event.text === "string" ? event.text : "";
        if (text.trim()) {
          lastAssistantTextPreview = text.trim().slice(0, 280);
        }
        log(onLog, "");
        log(onLog, `Agent : ${event.text}`);
        log(onLog, "");
      }

      if (
        itemType === "function_call" &&
        "item" in event &&
        event.item &&
        "name" in event.item
      ) {
        if (event.item.name === CREATE_WORDPRESS_DRAFT_TOOL_NAME) {
          await emitProgress(
            onProgress,
            "creating_wordpress",
            PROGRESS_MESSAGES.creatingWordpress
          );
        }
        if (event.item.name === CREATE_WEBFLOW_DRAFT_TOOL_NAME) {
          await emitProgress(
            onProgress,
            "creating_webflow",
            PROGRESS_MESSAGES.creatingWebflow
          );
        }
      }

      if (event.type === "agent.session.requires_action") {
        if (!sessionId) {
          throw new AgentSessionError(
            "Session OpenAI manquante au moment de requires_action.",
            "missing_session"
          );
        }

        const session = await openai.beta.agents.sessions.retrieve(sessionId);

        for (const action of session.required_actions ?? []) {
          if (action.type !== "function_call") {
            continue;
          }

          if (action.name === CREATE_WORDPRESS_DRAFT_TOOL_NAME) {
            if (cmsDestination !== "wordpress") {
              throw new AgentSessionError(
                `Outil ${CREATE_WORDPRESS_DRAFT_TOOL_NAME} refusé pour la destination « ${cmsDestination} ».`,
                "tool_not_allowed_for_cms"
              );
            }
            if (
              !editorialAgent.allowedToolNames.includes(
                CREATE_WORDPRESS_DRAFT_TOOL_NAME
              )
            ) {
              throw new AgentSessionError(
                "Outil WordPress non autorisé pour cet agent éditorial.",
                "tool_not_allowed_for_agent"
              );
            }
            if (!wordpressCredentials) {
              throw new Error("Identifiants WordPress manquants.");
            }

            await emitProgress(
              onProgress,
              "creating_wordpress",
              PROGRESS_MESSAGES.creatingWordpress
            );

            const args = parseDraftArgs(action.arguments);

            const sanitized = sanitizeInternalLinks(
              args.content,
              allowedInternalUrls,
              wpHost
            );
            if (sanitized.removedUrls.length > 0) {
              log(
                onLog,
                `Maillage : ${sanitized.removedUrls.length} lien(s) interne(s) non autorisé(s) retiré(s).`
              );
              for (const url of sanitized.removedUrls.slice(0, 8)) {
                log(onLog, `  ✗ ${url}`);
              }
            }
            if (sanitized.duplicateUrls.length > 0) {
              log(
                onLog,
                `Maillage : ${sanitized.duplicateUrls.length} doublon(s) d'URL unwrapé(s).`
              );
            }
            if (sanitized.keptUrls.length > 0) {
              log(
                onLog,
                `Maillage : liens retenus — ${sanitized.keptUrls.join(" | ")}`
              );
            } else {
              log(onLog, "Maillage : aucun lien interne dans le brouillon.");
            }

            args.content = sanitized.content;

            log(onLog, "");
            log(onLog, "→ Appel create_wordpress_draft");
            log(onLog, `Titre : ${args.title}`);
            log(onLog, `Meta title : ${args.meta_title}`);
            log(
              onLog,
              `Meta title length : ${args.meta_title?.length ?? 0}`
            );
            log(onLog, `Meta description : ${args.meta_description}`);
            log(
              onLog,
              `Meta description length : ${args.meta_description?.length ?? 0}`
            );
            log(
              onLog,
              `Catégories : ${detectedCategories.map((c) => c.name).join(", ")}`
            );

            // Connecteur CMS WordPress — même createWordPressDraft sous-jacent.
            const cmsResult = await getCmsConnector(
              "wordpress",
              wordpressCredentials
            ).createDraft({
              ...args,
              categoryIds,
            });
            if (!cmsResult.wordpress) {
              throw new Error("Réponse CMS WordPress incomplète.");
            }
            const result: WordPressDraftResult = {
              success: true,
              post_id: cmsResult.wordpress.post_id,
              status: cmsResult.status,
              title: cmsResult.title,
              link: cmsResult.link,
              categories: cmsResult.wordpress.categories,
              meta_title: cmsResult.wordpress.meta_title,
              meta_description: cmsResult.wordpress.meta_description,
              seo_plugin: normalizeWpSeoPlugin(
                cmsResult.wordpress.seo_plugin
              ),
              seo_persisted: Boolean(cmsResult.wordpress.seo_persisted),
              seo_error: cmsResult.wordpress.seo_error ?? null,
            };

            wordpressResult = result;
            draftMeta = {
              slug: args.slug ?? "",
              excerpt: args.excerpt ?? "",
            };
            cmsResultNormalized = {
              destination: "wordpress",
              externalId: String(result.post_id),
              status: result.status,
              title: result.title,
              link: result.link,
              metaTitle: result.meta_title,
              metaDescription: result.meta_description,
              slug: draftMeta.slug ?? "",
              excerpt: draftMeta.excerpt ?? "",
            };

            log(onLog, "");
            log(onLog, "✅ Brouillon WordPress créé");
            log(onLog, `ID : ${result.post_id}`);
            log(onLog, `Statut : ${result.status}`);
            log(onLog, `Lien : ${result.link}`);
            log(onLog, `Plugin SEO : ${result.seo_plugin}`);
            if (result.seo_persisted) {
              log(onLog, "✅ Métadonnées SEO vérifiées");
            } else {
              log(
                onLog,
                `⚠️ Métadonnées SEO non persistées (brouillon conservé) : ${result.seo_error ?? "erreur inconnue"}`
              );
            }

            await openai.beta.agents.sessions.events.create(sessionId, {
              events: [
                {
                  type: "agent.session.input.tool_result",
                  turn_id: action.turn_id,
                  call_id: action.call_id,
                  success: true,
                  output: JSON.stringify(result),
                },
              ],
            });

            log(onLog, "→ Résultat renvoyé à l'agent");
            await emitProgress(
              onProgress,
              "finalizing",
              PROGRESS_MESSAGES.finalizing
            );
          }

          if (action.name === CREATE_WEBFLOW_DRAFT_TOOL_NAME) {
            if (cmsDestination !== "webflow") {
              throw new AgentSessionError(
                `Outil ${CREATE_WEBFLOW_DRAFT_TOOL_NAME} refusé pour la destination « ${cmsDestination} ».`,
                "tool_not_allowed_for_cms"
              );
            }
            if (
              !editorialAgent.allowedToolNames.includes(
                CREATE_WEBFLOW_DRAFT_TOOL_NAME
              )
            ) {
              throw new AgentSessionError(
                "Outil Webflow non autorisé pour cet agent éditorial.",
                "tool_not_allowed_for_agent"
              );
            }

            await emitProgress(
              onProgress,
              "creating_webflow",
              PROGRESS_MESSAGES.creatingWebflow
            );

            const args = parseWebflowDraftArgs(action.arguments);
            log(onLog, "");
            log(onLog, "→ Appel create_webflow_draft");
            log(onLog, `Titre : ${args.title}`);
            log(onLog, `Slug : ${args.slug}`);
            log(onLog, `Meta title : ${args.meta_title}`);
            log(onLog, `Meta description : ${args.meta_description}`);

            const cmsResult = await getCmsConnector("webflow").createDraft({
              ...args,
              webflowCategoryItemId,
              webflowAuthorItemId,
            });
            if (!cmsResult.webflow) {
              throw new Error("Réponse CMS Webflow incomplète.");
            }

            draftMeta = {
              slug: cmsResult.webflow.slug,
              excerpt: cmsResult.webflow.excerpt,
            };
            cmsResultNormalized = {
              destination: "webflow",
              externalId: cmsResult.externalId,
              status: cmsResult.status,
              title: cmsResult.title,
              link: "",
              metaTitle: cmsResult.webflow.meta_title,
              metaDescription: cmsResult.webflow.meta_description,
              slug: cmsResult.webflow.slug,
              excerpt: cmsResult.webflow.excerpt,
            };

            log(onLog, "");
            log(onLog, "✅ Brouillon Webflow créé");
            log(onLog, `ID CMS : ${cmsResult.externalId}`);
            log(onLog, `Statut : ${cmsResult.status}`);

            await openai.beta.agents.sessions.events.create(sessionId, {
              events: [
                {
                  type: "agent.session.input.tool_result",
                  turn_id: action.turn_id,
                  call_id: action.call_id,
                  success: true,
                  output: JSON.stringify({
                    success: true,
                    item_id: cmsResult.externalId,
                    status: cmsResult.status,
                    title: cmsResult.title,
                    isDraft: true,
                  }),
                },
              ],
            });

            log(onLog, "→ Résultat renvoyé à l'agent");
            await emitProgress(
              onProgress,
              "finalizing",
              PROGRESS_MESSAGES.finalizing
            );
          }
        }
      }

      if (event.type === "agent.session.turn.completed") {
        log(onLog, "");
        log(onLog, "✅ Tour terminé.");
        if (cmsResultNormalized) {
          await emitProgress(
            onProgress,
            "completed",
            PROGRESS_MESSAGES.completed
          );
        }
        break;
      }

      if (event.type === "agent.session.turn.failed") {
        log(onLog, "❌ Tour échoué");
        log(onLog, inspect(event, { depth: null }));
        await emitProgress(onProgress, "failed", PROGRESS_MESSAGES.failed);
        throw new AgentSessionError(
          "Tour OpenAI échoué.",
          "turn_failed",
          sessionId
        );
      }

      if (event.type === "agent.session.turn.cancelled") {
        log(onLog, "⚠️ Tour annulé.");
        await emitProgress(onProgress, "failed", PROGRESS_MESSAGES.failed);
        throw new AgentSessionError(
          "Tour OpenAI annulé.",
          "turn_cancelled",
          sessionId
        );
      }
    }
  } catch (error) {
    attachObservedEvents(
      error,
      eventTraceFromState(eventTrace, sessionId),
      wordpressResult?.status ?? cmsResultNormalized?.status ?? null,
      wordpressResult
        ? { postId: wordpressResult.post_id, link: wordpressResult.link }
        : undefined
    );
    throw error;
  } finally {
    logInfo("agent", "observed events", {
      types: [...observedEventTypes].join(","),
      items: [...observedItemTypes].join(",") || null,
      sawWebSearch: sawWebSearch ? 1 : 0,
      sawWriting: emittedWriting ? 1 : 0,
    });
    stream.controller.abort();
  }

  if (!sessionId) {
    const error = new AgentSessionError(
      "Session OpenAI manquante à la fin du tour.",
      "missing_session"
    );
    attachObservedEvents(error, eventTraceFromState(eventTrace, sessionId), null);
    throw error;
  }

  if (!cmsResultNormalized) {
    const missingTool =
      cmsDestination === "webflow"
        ? "create_webflow_draft"
        : "create_wordpress_draft";
    const hint =
      emittedWriting || lastAssistantTextPreview
        ? " L'agent a produit du texte sans appeler l'outil de création de brouillon."
        : "";
    if (lastAssistantTextPreview) {
      log(
        onLog,
        `Aperçu texte agent (non utilisé pour créer un brouillon) : ${lastAssistantTextPreview}`
      );
    }
    const error = new AgentSessionError(
      `${missingTool} n'a pas été appelé.${hint}`,
      "no_draft",
      sessionId
    );
    attachObservedEvents(
      error,
      eventTraceFromState(eventTrace, sessionId),
      null
    );
    throw error;
  }

  const collected = await collectSessionUsage(sessionId, openai);
  const usage = collected.usage;
  const estimatedCost =
    usage !== null
      ? estimateLlmCostUsd(collected.model, {
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: usage.outputTokens,
        })
      : null;

  return {
    success: true,
    sessionId,
    subject: trimmedSubject,
    cmsDestination,
    cms: cmsResultNormalized,
    wordpress:
      wordpressResult && cmsDestination === "wordpress"
        ? toCallerResult(wordpressResult, draftMeta)
        : null,
    detectedCategories: detectedCategories.map((category) => ({
      categoryId: category.categoryId,
      name: category.name,
    })),
    model: collected.model,
    inputTokens: usage?.inputTokens ?? null,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    reasoningTokens: usage?.reasoningTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    estimatedCost,
    usageCollection: {
      source: collected.source,
      attempt: collected.attempt,
      retries: collected.retries,
      delayMs: collected.delayMs,
      raw: usage?.raw ?? null,
    },
    trace: eventTraceFromState(eventTrace, sessionId),
  };
}
