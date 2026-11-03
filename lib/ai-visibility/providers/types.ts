import type { ProviderAnswer, VisibilityCitation } from "../constants";

export type VisibilityProviderId = "openai";

export type AskVisibilityParams = {
  question: string;
  country: string;
  language: string;
  model: string;
  instructions?: string | null;
  brandContext?: string | null;
};

export interface VisibilityProvider {
  id: VisibilityProviderId;
  ask(params: AskVisibilityParams): Promise<ProviderAnswer>;
}

export type { ProviderAnswer, VisibilityCitation };
