/**
 * Registre des agents éditoriaux OpenAI spécialisés par CMS (V7.9.1).
 * Aucun basculement silencieux vers l’agent WordPress si un autre profil est indisponible.
 */
import type { AgentToolParam } from "openai/resources/beta/agents/agents.js";
import {
  isCmsDestinationEnabled,
  normalizeCmsDestination,
  type CmsDestinationId,
} from "@/lib/cms";
import {
  resolveOpenAiConfig,
  resolveWebflowAgentId,
} from "@/lib/settings/app-settings";
import {
  agentSessionTools,
  CREATE_WORDPRESS_DRAFT_TOOL_NAME,
} from "@/lib/agent/tools";
import { CREATE_WEBFLOW_DRAFT_TOOL_NAME } from "@/lib/agent/webflow-draft-tool";

export type EditorialAgentSource = "database" | "env";

export type EditorialAgentProfile = {
  cmsDestination: CmsDestinationId;
  label: string;
  description: string;
  /** Variable d’environnement de référence pour cet agent. */
  agentEnvKey: "OPENAI_AGENT_ID" | "OPENAI_WEBFLOW_AGENT_ID";
  /** Noms d’outils autorisés pour ce CMS. */
  allowedToolNames: readonly string[];
};

export type ResolvedEditorialAgent = {
  cmsDestination: CmsDestinationId;
  label: string;
  agentId: string;
  agentIdSource: EditorialAgentSource;
  tools: AgentToolParam[];
  allowedToolNames: readonly string[];
};

/** Profils déclaratifs — Webflow préparé mais non activé côté CMS. */
export const EDITORIAL_AGENT_PROFILES: readonly EditorialAgentProfile[] = [
  {
    cmsDestination: "wordpress",
    label: "Agent éditorial WordPress",
    description:
      "Agent OpenAI historique (OPENAI_AGENT_ID / AppSettings). Outils : recherche web + create_wordpress_draft.",
    agentEnvKey: "OPENAI_AGENT_ID",
    allowedToolNames: ["web_search", CREATE_WORDPRESS_DRAFT_TOOL_NAME],
  },
  {
    cmsDestination: "webflow",
    label: "Agent éditorial Webflow",
    description:
      "Agent dédié (OPENAI_WEBFLOW_AGENT_ID / AppSettings). create_webflow_draft préparé mais non branché (génération désactivée).",
    agentEnvKey: "OPENAI_WEBFLOW_AGENT_ID",
    // create_webflow_draft listé pour documentation ; non inclus dans les tools de session.
    allowedToolNames: ["web_search", CREATE_WEBFLOW_DRAFT_TOOL_NAME],
  },
] as const;

export function getEditorialAgentProfile(
  destination: CmsDestinationId
): EditorialAgentProfile {
  const profile = EDITORIAL_AGENT_PROFILES.find(
    (item) => item.cmsDestination === destination
  );
  if (!profile) {
    throw new Error(`Profil d’agent éditorial inconnu pour « ${destination} ».`);
  }
  return profile;
}

/**
 * Outils OpenAI autorisés pour une destination.
 * WordPress : outils historiques inchangés.
 * Webflow : web_search uniquement tant que create_webflow_draft n’est pas activé.
 */
export function getAgentToolsForDestination(
  destination: CmsDestinationId
): AgentToolParam[] {
  const profile = getEditorialAgentProfile(destination);
  const allowed = new Set(profile.allowedToolNames);

  if (destination === "wordpress") {
    // Réutilise exactement la liste historique (ordre et schéma inchangés).
    const tools = agentSessionTools.filter((tool) => {
      if (tool.type === "web_search") {
        return allowed.has("web_search");
      }
      if (tool.type === "function") {
        return allowed.has(tool.name);
      }
      return false;
    });
    if (tools.length !== agentSessionTools.length) {
      throw new Error(
        "Isolation des outils WordPress incohérente avec agentSessionTools."
      );
    }
    return tools;
  }

  // Webflow : pas de create_wordpress_draft ; create_webflow_draft non branché.
  return agentSessionTools.filter(
    (tool) => tool.type === "web_search" && allowed.has("web_search")
  );
}

/**
 * Résout l’agent OpenAI pour une destination CMS.
 * - WordPress : AppSettings.openaiAgentId puis OPENAI_AGENT_ID (comportement historique).
 * - Webflow : AppSettings.openaiWebflowAgentId puis OPENAI_WEBFLOW_AGENT_ID — jamais de repli WP.
 * La destination Webflow reste désactivée (génération refusée) en V7.10.0.
 */
export async function resolveEditorialAgentForDestination(
  destinationInput: CmsDestinationId | string | null | undefined
): Promise<ResolvedEditorialAgent> {
  const destination = normalizeCmsDestination(
    typeof destinationInput === "string"
      ? destinationInput
      : destinationInput ?? null
  );

  if (!isCmsDestinationEnabled(destination)) {
    throw new Error(
      destination === "webflow"
        ? "Webflow n’est pas encore disponible pour la génération. Validez la connexion et le mapping, puis utilisez WordPress."
        : `La destination CMS « ${destination} » n’est pas activée.`
    );
  }

  const profile = getEditorialAgentProfile(destination);
  const tools = getAgentToolsForDestination(destination);

  if (destination === "wordpress") {
    const openai = await resolveOpenAiConfig();
    if (!openai?.agentId) {
      throw new Error(
        "Agent éditorial WordPress non configuré (OPENAI_AGENT_ID / AppSettings)."
      );
    }
    if (!openai.apiKey) {
      throw new Error("Clé API OpenAI manquante pour l’agent WordPress.");
    }
    return {
      cmsDestination: "wordpress",
      label: profile.label,
      agentId: openai.agentId,
      agentIdSource: openai.agentIdSource,
      tools,
      allowedToolNames: profile.allowedToolNames,
    };
  }

  // Webflow — pas de fallback silencieux vers OPENAI_AGENT_ID / agent WP.
  const webflowAgent = await resolveWebflowAgentId();
  if (!webflowAgent?.agentId || !webflowAgent.agentIdSource) {
    throw new Error(
      "Agent éditorial Webflow non configuré (OPENAI_WEBFLOW_AGENT_ID / AppSettings). Aucun repli sur l’agent WordPress."
    );
  }

  return {
    cmsDestination: "webflow",
    label: profile.label,
    agentId: webflowAgent.agentId,
    agentIdSource: webflowAgent.agentIdSource,
    tools,
    allowedToolNames: profile.allowedToolNames,
  };
}

/** Vue publique (sans secrets) pour Paramètres / Intégrations. */
export type PublicEditorialAgentStatus = {
  cmsDestination: CmsDestinationId;
  label: string;
  description: string;
  agentEnvKey: EditorialAgentProfile["agentEnvKey"];
  configured: boolean;
  agentIdSource: EditorialAgentSource | null;
  /** Aperçu non sensible : longueur uniquement. */
  agentIdConfiguredLength: number | null;
  destinationEnabled: boolean;
};

export async function listPublicEditorialAgentStatuses(): Promise<
  PublicEditorialAgentStatus[]
> {
  const openai = await resolveOpenAiConfig();
  const webflowAgent = await resolveWebflowAgentId();

  return EDITORIAL_AGENT_PROFILES.map((profile) => {
    const destinationEnabled = isCmsDestinationEnabled(profile.cmsDestination);
    if (profile.cmsDestination === "wordpress") {
      const configured = Boolean(openai?.agentId);
      return {
        cmsDestination: profile.cmsDestination,
        label: profile.label,
        description: profile.description,
        agentEnvKey: profile.agentEnvKey,
        configured,
        agentIdSource: configured ? openai!.agentIdSource : null,
        agentIdConfiguredLength: configured ? openai!.agentId.length : null,
        destinationEnabled,
      };
    }
    const configured = Boolean(webflowAgent?.agentId);
    return {
      cmsDestination: profile.cmsDestination,
      label: profile.label,
      description: profile.description,
      agentEnvKey: profile.agentEnvKey,
      configured,
      agentIdSource: configured ? webflowAgent!.agentIdSource : null,
      agentIdConfiguredLength: configured
        ? webflowAgent!.agentId!.length
        : null,
      destinationEnabled,
    };
  });
}
