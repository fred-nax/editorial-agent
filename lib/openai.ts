import OpenAI from "openai";
import { resolveOpenAiConfig } from "@/lib/settings/app-settings";

export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

/**
 * Client OpenAI avec la clé effective (PostgreSQL > env).
 * À utiliser pour toute opération métier.
 */
export async function getOpenAIClient(): Promise<OpenAI> {
  const config = await resolveOpenAiConfig();
  if (!config?.apiKey) {
    throw new Error("OpenAI non configuré (clé API manquante).");
  }
  return createOpenAIClient(config.apiKey);
}

/**
 * @deprecated Ne plus utiliser — contourne AppSettings (env uniquement).
 * Conservé uniquement pour détecter les imports accidentels.
 */
export const openai: OpenAI = new Proxy({} as OpenAI, {
  get() {
    throw new Error(
      "Import synchrone `openai` interdit. Utilisez getOpenAIClient() (DB > env)."
    );
  },
});
