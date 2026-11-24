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
import { resolveOpenAiConfig } from "@/lib/settings/app-settings";
import {
  agentSessionTools,
  CREATE_WORDPRESS_DRAFT_TOOL_NAME,
} from "@/lib/agent/tools";

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
      "Agent dédié futur (OPENAI_WEBFLOW_AGENT_ID). Non utilisable tant que Webflow n’est pas activé.",
    agentEnvKey: "OPENAI_WEBFLOW_AGENT_ID",
    // Pas de create_wordpress_draft — isolation stricte des outils.
    allowedToolNames: ["web_search"],
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
 * Webflow : sous-ensemble sans create_wordpress_draft (et destination encore désactivée).
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

  // Webflow : uniquement web_search pour l’instant (pas de faux outil CMS).
  return agentSessionTools.filter(
    (tool) => tool.type === "web_search" && allowed.has("web_search")
  );
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

/**
 * Résout l’agent OpenAI pour une destination CMS.
 * - WordPress : AppSettings.openaiAgentId puis OPENAI_AGENT_ID (comportement historique).
 * - Webflow : uniquement OPENAI_WEBFLOW_AGENT_ID — jamais de repli sur WordPress.
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
        ? "Webflow n’est pas encore disponible. Sélectionnez WordPress."
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

  // Webflow — pas de fallback silencieux vers OPENAI_AGENT_ID.
  const webflowAgentId = readEnv("OPENAI_WEBFLOW_AGENT_ID");
  if (!webflowAgentId) {
    throw new Error(
      "Agent éditorial Webflow non configuré (OPENAI_WEBFLOW_AGENT_ID manquant). Aucun repli sur l’agent WordPress."
    );
  }

  return {
    cmsDestination: "webflow",
    label: profile.label,
    agentId: webflowAgentId,
    agentIdSource: "env",
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
  const webflowAgentId = readEnv("OPENAI_WEBFLOW_AGENT_ID");

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
    const configured = Boolean(webflowAgentId);
    return {
      cmsDestination: profile.cmsDestination,
      label: profile.label,
      description: profile.description,
      agentEnvKey: profile.agentEnvKey,
      configured,
      agentIdSource: configured ? "env" : null,
      agentIdConfiguredLength: configured ? webflowAgentId!.length : null,
      destinationEnabled,
    };
  });
}
