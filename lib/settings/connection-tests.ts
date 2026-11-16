import OpenAI from "openai";
import type { OpenAiConfig, WordPressConfig } from "@/lib/settings/app-settings";
import { assertSafeWordPressUrlResolved } from "@/lib/settings/wp-url";

export type ConnectionTestResult = {
  ok: boolean;
  message: string;
  details?: Record<string, string | boolean | number | null>;
};

/** Test léger : auth + retrieve agent — aucune session / génération. */
export async function testOpenAiConnection(
  config: Pick<OpenAiConfig, "apiKey" | "agentId">
): Promise<ConnectionTestResult> {
  const apiKey = config.apiKey.trim();
  const agentId = config.agentId.trim();
  if (!apiKey || !agentId) {
    return {
      ok: false,
      message: "Clé API ou identifiant d’agent manquant.",
    };
  }

  try {
    const client = new OpenAI({ apiKey });
    const agent = await client.beta.agents.retrieve(agentId);
    const name =
      typeof agent.name === "string" && agent.name.trim()
        ? agent.name.trim()
        : null;
    const hasInstructions =
      typeof agent.instructions === "string" &&
      agent.instructions.trim().length > 0;

    return {
      ok: true,
      message: name
        ? `Connexion réussie — agent « ${name} » accessible.`
        : "Connexion réussie — agent accessible.",
      details: {
        agentId: agent.id,
        name,
        hasInstructions,
        model: typeof agent.model === "string" ? agent.model : null,
      },
    };
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : null;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        message: "Authentification OpenAI refusée (clé API invalide).",
      };
    }
    if (status === 404) {
      return {
        ok: false,
        message: "Agent introuvable pour cet identifiant.",
      };
    }
    return {
      ok: false,
      message: "Impossible de joindre l’agent OpenAI.",
    };
  }
}

/** Test non destructif : users/me + capacité d’édition. */
export async function testWordPressConnection(
  config: Pick<WordPressConfig, "url" | "username" | "appPassword">
): Promise<ConnectionTestResult> {
  let baseUrl: string;
  try {
    baseUrl = await assertSafeWordPressUrlResolved(config.url);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "URL WordPress invalide.",
    };
  }

  const username = config.username.trim();
  const appPassword = config.appPassword.trim();
  if (!username || !appPassword) {
    return {
      ok: false,
      message: "Identifiants WordPress incomplets.",
    };
  }

  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const endpoint = `${baseUrl}/wp-json/wp/v2/users/me?context=edit`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Basic ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      return {
        ok: false,
        message: "Redirection inattendue depuis WordPress.",
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message: "Identifiants WordPress refusés.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        message: `WordPress a répondu HTTP ${response.status}.`,
      };
    }

    const data = (await response.json()) as {
      id?: number;
      name?: string;
      slug?: string;
      capabilities?: Record<string, boolean>;
    };

    const caps = data.capabilities ?? {};
    const canEdit =
      caps.edit_posts === true ||
      caps.edit_pages === true ||
      caps.publish_posts === true;

    if (!canEdit) {
      return {
        ok: false,
        message:
          "Connecté, mais le compte n’a pas les permissions d’édition nécessaires.",
        details: {
          userId: data.id ?? null,
          name: data.name ?? null,
        },
      };
    }

    return {
      ok: true,
      message: data.name
        ? `Connexion réussie — compte « ${data.name} » avec permissions d’édition.`
        : "Connexion réussie — permissions d’édition confirmées.",
      details: {
        userId: typeof data.id === "number" ? data.id : null,
        name: data.name ?? null,
        canEditPosts: caps.edit_posts === true,
      },
    };
  } catch {
    return {
      ok: false,
      message: "Impossible de joindre le site WordPress.",
    };
  }
}
