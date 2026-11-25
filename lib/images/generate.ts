import { getOpenAIClient } from "@/lib/openai";
import { parseImagesUsage, type ImagesUsageSnapshot } from "@/lib/openai-usage-parse";
import {
  FEATURED_IMAGE_MIME,
  FEATURED_IMAGE_MODEL,
  FEATURED_IMAGE_OUTPUT_FORMAT,
  FEATURED_IMAGE_QUALITY,
  MAX_IMAGE_BYTES,
} from "./config";

export type GeneratedImageBytes = {
  bytes: Buffer;
  mimeType: string;
  model: string;
  size: string;
  quality: string;
  /** Consommation Images API si fournie par OpenAI — null sinon (coût inconnu). */
  usage: ImagesUsageSnapshot | null;
};

export class FeaturedImageGenerationError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "FeaturedImageGenerationError";
    this.status = status;
  }
}

export async function generateFeaturedImageBytes(input: {
  prompt: string;
  size: string;
}): Promise<GeneratedImageBytes> {
  const prompt = input.prompt.trim();
  if (!prompt || prompt.length > 32000) {
    throw new FeaturedImageGenerationError("Prompt visuel invalide.", 400);
  }

  let response;
  try {
    const openai = await getOpenAIClient();
    response = await openai.images.generate({
      model: FEATURED_IMAGE_MODEL,
      prompt,
      n: 1,
      size: input.size,
      quality: FEATURED_IMAGE_QUALITY,
      output_format: FEATURED_IMAGE_OUTPUT_FORMAT,
      background: "opaque",
    });
  } catch {
    throw new FeaturedImageGenerationError(
      "La génération d’image a échoué. Réessayez plus tard.",
      502
    );
  }

  const first = response.data?.[0];
  const b64 = first?.b64_json;
  if (!b64) {
    throw new FeaturedImageGenerationError(
      "Réponse d’image incomplète.",
      502
    );
  }

  const bytes = Buffer.from(b64, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new FeaturedImageGenerationError(
      "Image générée invalide ou trop volumineuse.",
      502
    );
  }

  return {
    bytes,
    mimeType: FEATURED_IMAGE_MIME,
    model: FEATURED_IMAGE_MODEL,
    size: input.size,
    quality: FEATURED_IMAGE_QUALITY,
    usage: parseImagesUsage(response),
  };
}
