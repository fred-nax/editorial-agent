import { getOpenAIClient } from "@/lib/openai";
import { FEATURED_ALT_MODEL, MAX_ALT_TEXT_LENGTH } from "./config";

export type AltTextInput = {
  imageBytes: Buffer;
  mimeType: string;
  title: string | null;
  subject: string;
  languageLabel: string | null;
};

/**
 * Nettoie la proposition ALT sans tronquer artificiellement une phrase naturelle.
 * Plafond technique uniquement (sécurité stockage / champ éditable).
 */
export function cleanAlt(value: string): string | null {
  let cleaned = value
    .replace(/\u0000/g, "")
    .replace(/^["'«»]+|["'«»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }
  if (/^image\s+de\b/i.test(cleaned) || /^photo\s+de\b/i.test(cleaned)) {
    cleaned =
      cleaned.replace(/^(image|photo)\s+de\s+/i, "").trim() || "";
  }
  if (!cleaned) {
    return null;
  }
  if (cleaned.length > MAX_ALT_TEXT_LENGTH) {
    return cleaned.slice(0, MAX_ALT_TEXT_LENGTH).trimEnd();
  }
  return cleaned;
}

export const FEATURED_ALT_SYSTEM_PROMPT = [
  "Tu rédiges uniquement un texte alternatif (ALT) pour l’accessibilité web.",
  "Une seule phrase courte, naturelle et descriptive.",
  "Longueur indicative : environ 80 à 150 caractères.",
  "Décris les éléments principaux réellement visibles sur l’image (personnes, lieux, objets, ambiance visible).",
  "N’invente rien : aucune affirmation sur des éléments invisibles, supposés ou hors cadre.",
  "Pas de bourrage de mots-clés SEO, pas de titre déguisé, pas de formule « Image de » ou « Photo de ».",
  "Réponds uniquement par la phrase ALT, sans guillemets ni préambule.",
].join(" ");

/**
 * Propose un texte ALT à partir de l’image. Échec soft : retourne null.
 */
export async function proposeFeaturedImageAltText(
  input: AltTextInput
): Promise<{ altText: string | null; model: string }> {
  const language = input.languageLabel?.trim() || "français";
  const title = input.title?.trim() || input.subject.trim();
  const dataUrl = `data:${input.mimeType};base64,${input.imageBytes.toString("base64")}`;

  try {
    const openai = await getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: FEATURED_ALT_MODEL,
      max_tokens: 160,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: FEATURED_ALT_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Rédige le texte ALT en ${language}.`,
                `Titre de l’article (contexte uniquement, ne pas le recopier) : ${title}.`,
                `Sujet (contexte uniquement) : ${input.subject.trim()}.`,
                "Exemple de style attendu : « Une aide-soignante accompagne une femme âgée devant un ordinateur portable, avec des symboles d'intelligence artificielle en arrière-plan. »",
                "Décris seulement ce qui est visible sur l’image fournie.",
              ].join("\n"),
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "low" },
            },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    return { altText: cleanAlt(raw), model: FEATURED_ALT_MODEL };
  } catch {
    return { altText: null, model: FEATURED_ALT_MODEL };
  }
}
