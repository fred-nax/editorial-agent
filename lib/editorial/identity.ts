/**
 * Identité éditoriale dérivée de la configuration d'installation (V7.8.0).
 * Naxialis (hôte naxialis.com) conserve les formulations historiques.
 * Les autres installations utilisent siteName / clientName — sans hardcode Naxialis.
 */

export type EditorialIdentity = {
  brandName: string;
  siteHost: string;
  blogLabel: string;
  /** true uniquement si l'URL WordPress effective pointe vers naxialis.com */
  isNaxialisLegacy: boolean;
};

/** Identité historique — défaut pour les appels sans contexte (tests / compat). */
export const NAXIALIS_DEFAULT_IDENTITY: EditorialIdentity = {
  brandName: "Naxialis",
  siteHost: "naxialis.com",
  blogLabel: "blog Naxialis",
  isNaxialisLegacy: true,
};

export function siteHostFromUrl(wpUrl: string | null | undefined): string | null {
  if (!wpUrl?.trim()) {
    return null;
  }
  try {
    return new URL(wpUrl.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function isNaxialisWpHost(hostname: string | null | undefined): boolean {
  if (!hostname) {
    return false;
  }
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "naxialis.com" || host.endsWith(".naxialis.com");
}

export function resolveEditorialIdentity(input: {
  wpUrl?: string | null;
  siteName?: string | null;
  clientName?: string | null;
}): EditorialIdentity {
  const host = siteHostFromUrl(input.wpUrl);
  if (isNaxialisWpHost(host)) {
    return {
      brandName: "Naxialis",
      siteHost: host ?? "naxialis.com",
      blogLabel: "blog Naxialis",
      isNaxialisLegacy: true,
    };
  }

  const brand =
    input.siteName?.trim() ||
    input.clientName?.trim() ||
    "ce site";

  return {
    brandName: brand,
    siteHost: host || "localhost",
    blogLabel: `blog ${brand}`,
    isNaxialisLegacy: false,
  };
}

/** Formulations dynamiques pour les prompts (compat Naxialis inchangée si legacy). */
export function editorialPromptPhrases(identity: EditorialIdentity) {
  const { brandName, siteHost, blogLabel, isNaxialisLegacy } = identity;
  return {
    articleIntro: `Crée un article complet pour le ${blogLabel} sur :`,
    linkingFallback: isNaxialisLegacy
      ? `- intégrer des liens internes pertinents vers Naxialis uniquement s'ils sont explicitement fournis ailleurs dans ce message ;`
      : `- intégrer des liens internes pertinents vers ${brandName} uniquement s'ils sont explicitement fournis ailleurs dans ce message ;`,
    linkingEmpty: isNaxialisLegacy
      ? `- N'ajoute AUCUN lien interne vers naxialis.com.`
      : `- N'ajoute AUCUN lien interne vers ${siteHost}.`,
    linkingHeader: isNaxialisLegacy
      ? `Tu ne dois utiliser QUE les URL ci-dessous pour tout lien interne Naxialis.`
      : `Tu ne dois utiliser QUE les URL ci-dessous pour tout lien interne ${brandName}.`,
    titlesIntro: isNaxialisLegacy
      ? `Propose exactement 5 titres d’articles de blog professionnels pour Naxialis.`
      : `Propose exactement 5 titres d’articles de blog professionnels pour ${brandName}.`,
    featuredImageIntro: isNaxialisLegacy
      ? `Crée une image à la une pour un article de blog professionnel Naxialis.`
      : `Crée une image à la une pour un article de blog professionnel ${brandName}.`,
    freeTopicCatalog: isNaxialisLegacy
      ? `Sujet libre à explorer (ne le force PAS dans un catalogue Naxialis)`
      : `Sujet libre à explorer (ne le force PAS dans un catalogue thématique fixe)`,
    agentInstructionsRespect: isNaxialisLegacy
      ? `- Respecter les instructions permanentes de l'agent Naxialis.`
      : `- Respecter les instructions permanentes de l'agent éditorial.`,
    metaBrandHint: isNaxialisLegacy
      ? `- ne pas ajouter automatiquement "NAXIALIS" au meta title sauf si cela reste pertinent et sous 60 caractères ;`
      : `- ne pas ajouter automatiquement le nom de marque au meta title sauf si cela reste pertinent et sous 60 caractères ;`,
  };
}
