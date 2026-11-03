import {
  categoryToLegacyKind,
  normalizeDomain,
  type ExtractedEntity,
  type MentionKind,
} from "./constants";
import { classifyMentionKind, enrichExtractedEntity } from "./classify";
import {
  brandDomainVariants,
  isTargetBrandEntity,
  type BrandIdentity,
} from "./brand-identity";
import {
  hasVerifiableIdentitySignals,
  isDistinctiveOrganizationName,
  isGenericDescriptor,
  isLexicalNoiseName,
} from "./generic-filter";
import {
  findBoundedNameIndex,
  verifyNamePresence,
} from "./match-name";
import {
  entityNormalizedKey,
} from "./resolve";

/**
 * Étape A — Extraction GEO 1.1.2
 * Patterns organisationnels stricts — pas de mots capitalisés / acronymes génériques.
 */

export type ExtractionRejection = {
  name: string;
  reason: string;
};

export type ExtractionResult = {
  entities: ExtractedEntity[];
  rejected: ExtractionRejection[];
};

export {
  isGenericDescriptor,
  hasVerifiableIdentitySignals,
  isDistinctiveOrganizationName,
  isLexicalNoiseName,
};

export { nameMatchesBounded, verifyNamePresence } from "./match-name";

function excerptAround(text: string, index: number, length: number): string {
  return text
    .slice(Math.max(0, index - 50), index + length + 90)
    .trim()
    .slice(0, 280);
}

/**
 * Compat : présence bornée corps vs titres/domaines de citations (pas les URL).
 */
export function verifyNameInResponse(input: {
  name: string;
  text: string;
  citations?: Array<{ url: string; title?: string | null; domain?: string | null }>;
}): { present: boolean; inBody: boolean; inCitations: boolean } {
  const presence = verifyNamePresence({
    name: input.name,
    bodyText: input.text,
    citations: input.citations,
  });
  return {
    present: presence.present,
    inBody: presence.inBody,
    inCitations: presence.inCitationTitles || presence.inCitationDomains,
  };
}

/**
 * Supprime les fragments (ex. Infinity ⊂ IA Infinity) sans fusion lexicale globale.
 */
export function collapseNameFragments(
  entities: ExtractedEntity[]
): ExtractedEntity[] {
  return entities.filter((entity) => {
    const key = entityNormalizedKey(entity.name);
    const tokens = key.split(" ").filter(Boolean);
    if (tokens.length !== 1) {
      return true;
    }
    const fragment = tokens[0]!;
    return !entities.some((other) => {
      if (other === entity) {
        return false;
      }
      const otherKey = entityNormalizedKey(other.name);
      if (otherKey === key) {
        return false;
      }
      const otherTokens = otherKey.split(" ").filter(Boolean);
      return otherTokens.length > 1 && otherTokens.includes(fragment);
    });
  });
}

export function extractEntityCandidates(input: {
  text: string;
  brand: BrandIdentity;
  citations?: Array<{ url: string; domain?: string | null; title?: string | null }>;
  campaignSubject?: string | null;
  historicalNames?: Array<{
    name: string;
    domain?: string | null;
    rawName?: string | null;
    mentionKind?: MentionKind;
    excerpt?: string | null;
    categoryManual?: boolean;
    lockedCategory?: ExtractedEntity["category"] | null;
    /** Provenance pour audit ; entity seule sans preuve → rejet. */
    source?: "mention" | "entity" | "snapshot" | "alias";
  }>;
}): ExtractionResult {
  const rejected: ExtractionRejection[] = [];
  const entities: ExtractedEntity[] = [];
  const seenKeys = new Set<string>();

  const push = (
    partial: Omit<ExtractedEntity, "category" | "kind"> & {
      category?: ExtractedEntity["category"];
      skipGenericFilter?: boolean;
    }
  ) => {
    const name = partial.name.trim();
    if (!name) {
      return;
    }
    if (
      !partial.skipGenericFilter &&
      (isLexicalNoiseName(name) || isGenericDescriptor(name))
    ) {
      rejected.push({
        name,
        reason:
          "Expression générique / bruit lexical sans identité démontrable (rejetée).",
      });
      return;
    }
    if (
      !partial.skipGenericFilter &&
      !hasVerifiableIdentitySignals({
        name,
        domain: partial.domain,
        excerpt: partial.excerpt,
      }) &&
      !isTargetBrandEntity(
        { name, domain: partial.domain ?? null, category: "unknown" },
        input.brand
      )
    ) {
      rejected.push({
        name,
        reason: "Identité insuffisamment étayée pour créer une observation.",
      });
      return;
    }

    const key = `${entityNormalizedKey(name)}|${partial.mentionKind}`;
    if (seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);
    const { skipGenericFilter: _skip, ...rest } = partial;
    entities.push(
      enrichExtractedEntity(rest, input.brand, input.campaignSubject)
    );
  };

  // Marque cible — match borné
  for (const alias of [input.brand.name, ...(input.brand.aliases ?? [])]) {
    const presence = verifyNamePresence({
      name: alias,
      bodyText: input.text,
      citations: input.citations,
    });
    if (!presence.inBody) {
      continue;
    }
    const found = findBoundedNameIndex(alias, input.text);
    const excerpt = found
      ? excerptAround(input.text, found.index, found.length)
      : null;
    push({
      name: input.brand.name,
      rawName: alias,
      domain: input.brand.primaryDomain,
      mentionKind: classifyMentionKind({
        excerpt,
        inBody: true,
        citationOnly: false,
      }),
      appearanceOrder: 1,
      excerpt,
      confidence: 0.9,
      skipGenericFilter: true,
    });
    break;
  }

  // Concurrents déclarés
  for (const competitor of input.brand.knownCompetitors ?? []) {
    if (!competitor.name) {
      continue;
    }
    const presence = verifyNamePresence({
      name: competitor.name,
      bodyText: input.text,
      citations: input.citations,
    });
    if (!presence.inBody) {
      continue;
    }
    const found = findBoundedNameIndex(competitor.name, input.text);
    const excerpt = found
      ? excerptAround(input.text, found.index, found.length)
      : null;
    push({
      name: competitor.name,
      rawName: competitor.name,
      domain: competitor.domain ?? null,
      mentionKind: classifyMentionKind({
        excerpt,
        inBody: true,
        citationOnly: false,
      }),
      appearanceOrder: entities.length + 1,
      excerpt,
      confidence: 0.85,
      category: "direct_competitor",
      skipGenericFilter: true,
    });
  }

  // Historiques : preuve bornée + identité ; entity DB / faux positifs 1.1.x non réinjectés
  for (const historical of input.historicalNames ?? []) {
    const checkName = historical.rawName || historical.name;
    if (historical.categoryManual && historical.lockedCategory) {
      const presenceManual = verifyNamePresence({
        name: checkName,
        bodyText: input.text,
        citations: input.citations,
      });
      const presenceCanonManual =
        historical.name !== checkName
          ? verifyNamePresence({
              name: historical.name,
              bodyText: input.text,
              citations: input.citations,
            })
          : presenceManual;
      if (!(presenceManual.present || presenceCanonManual.present)) {
        rejected.push({
          name: checkName,
          reason:
            "Correction manuelle conservée en base mais non vérifiable dans cette réponse.",
        });
        continue;
      }
      const inBody =
        presenceManual.inBody || presenceCanonManual.inBody;
      const inCitations =
        presenceManual.inCitationTitles ||
        presenceManual.inCitationDomains ||
        presenceCanonManual.inCitationTitles ||
        presenceCanonManual.inCitationDomains;
      const mentionKind: MentionKind =
        !inBody && inCitations
          ? "citation_only"
          : historical.mentionKind && historical.mentionKind !== "citation_only"
            ? historical.mentionKind
            : classifyMentionKind({
                excerpt: historical.excerpt,
                inBody,
                citationOnly: !inBody && inCitations,
              });
      const found =
        findBoundedNameIndex(checkName, input.text) ||
        findBoundedNameIndex(historical.name, input.text);
      const excerpt =
        historical.excerpt ||
        (found
          ? excerptAround(input.text, found.index, found.length)
          : null);
      const key = `${entityNormalizedKey(historical.name)}|${mentionKind}`;
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      entities.push({
        name: historical.name,
        rawName: checkName,
        domain: historical.domain,
        kind: categoryToLegacyKind(historical.lockedCategory),
        category: historical.lockedCategory,
        categoryConfidence: 1,
        categoryJustification: "Classification manuelle verrouillée.",
        mentionKind,
        excerpt,
        confidence: 1,
      });
      continue;
    }

    if (
      isLexicalNoiseName(checkName) ||
      isLexicalNoiseName(historical.name) ||
      isGenericDescriptor(checkName) ||
      isGenericDescriptor(historical.name)
    ) {
      rejected.push({
        name: checkName,
        reason: "Historique lexicalement non identifiable — rejeté.",
      });
      continue;
    }

    const distinctive =
      isDistinctiveOrganizationName(historical.name) ||
      isDistinctiveOrganizationName(checkName);
    const identityOk = hasVerifiableIdentitySignals({
      name: historical.name,
      domain: historical.domain,
      excerpt: historical.excerpt,
    });

    if (!distinctive && !identityOk) {
      rejected.push({
        name: checkName,
        reason:
          "Historique sans forme organisationnelle distinctive — non restauré.",
      });
      continue;
    }

    if (
      historical.source === "entity" &&
      !historical.domain &&
      !distinctive
    ) {
      rejected.push({
        name: checkName,
        reason:
          "Historique issu uniquement de la base entités, sans preuve d’identité — non réinjecté.",
      });
      continue;
    }

    const presence = verifyNamePresence({
      name: checkName,
      bodyText: input.text,
      citations: input.citations,
    });
    const presenceCanon =
      historical.name !== checkName
        ? verifyNamePresence({
            name: historical.name,
            bodyText: input.text,
            citations: input.citations,
          })
        : presence;

    if (presence.onlyInUrlNoise || presenceCanon.onlyInUrlNoise) {
      rejected.push({
        name: checkName,
        reason:
          "Apparition limitée à une URL / paramètre de tracking — pas une mention.",
      });
      continue;
    }

    const inBody = presence.inBody || presenceCanon.inBody;
    const inCitationTitles =
      presence.inCitationTitles || presenceCanon.inCitationTitles;
    const inCitationDomains =
      presence.inCitationDomains || presenceCanon.inCitationDomains;
    const inCitations = inCitationTitles || inCitationDomains;

    // Corps, ou citation si le nom est déjà organisationnellement distinctif
    // (un domaine openai.com ne crée pas à lui seul une mention « OpenAI »)
    const ok =
      inBody || (distinctive && (inCitationTitles || inCitationDomains));

    if (!ok) {
      rejected.push({
        name: checkName,
        reason:
          "Entité historique non vérifiable (limites de mots) dans le corps ni titres/domaines de sources.",
      });
      continue;
    }

    const mentionKind: MentionKind =
      !inBody && inCitations
        ? "citation_only"
        : historical.mentionKind && historical.mentionKind !== "citation_only"
          ? historical.mentionKind
          : classifyMentionKind({
              excerpt: historical.excerpt,
              inBody,
              citationOnly: !inBody && inCitations,
            });

    const found =
      findBoundedNameIndex(checkName, input.text) ||
      findBoundedNameIndex(historical.name, input.text);
    const excerpt =
      historical.excerpt ||
      (found
        ? excerptAround(input.text, found.index, found.length)
        : null);

    // Ne pas bypasser le filtre : les faux positifs historiques doivent rester rejetés
    push({
      name: historical.name,
      rawName: checkName,
      domain: historical.domain,
      mentionKind,
      appearanceOrder: entities.length + 1,
      excerpt,
      confidence: 0.8,
      skipGenericFilter: false,
    });
  }

  // Patterns organisationnels stricts uniquement
  const orgPatterns: RegExp[] = [
    // IA Infinity / AI Foo
    /\b((?:IA|AI)\s+[A-ZÉÈÊÀÂÎÔÙÇ][A-Za-zÉÈÊÀÂÎÔÙÇéèêàâîôùç0-9&-]{2,40})\b/g,
    // Revolve IA / LUXIA Agents / Quadia Labs
    /\b([A-ZÉÈÊÀÂÎÔÙÇ][A-Za-zÉÈÊÀÂÎÔÙÇéèêàâîôùç0-9&-]{2,40}\s+(?:IA|AI|Agents?|Labs?|Agency|Studio))\b/g,
    // Marques inventées type Tensoria / Quadia
    /\b([A-ZÉÈÊÀÂÎÔÙÇ][A-Za-zÉÈÊÀÂÎÔÙÇéèêàâîôùç]{3,}(?:ia|ai))\b/g,
    // Cellules tableau markdown **NOM**
    /\|\s*\*\*([^*|]{2,60})\*\*\s*\|/g,
    // Liens markdown [Nom](https://…)
    /\[([^\]]{2,60})\]\(\s*https?:\/\/[^)]+\)/gi,
  ];

  for (const pattern of orgPatterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(input.text)) !== null) {
      const name = match[1]?.trim();
      if (!name) {
        continue;
      }
      // Ignore URLs / chemins capturés par erreur
      if (/^https?:/i.test(name) || name.includes("/")) {
        continue;
      }
      if (isLexicalNoiseName(name) || isGenericDescriptor(name)) {
        rejected.push({
          name,
          reason: "Candidat pattern rejeté (bruit lexical / générique).",
        });
        continue;
      }
      if (!isDistinctiveOrganizationName(name) && !/\s/.test(name) && !/ia$/i.test(name)) {
        // Liens markdown génériques (« guide », « ici ») 
        if (!/^[A-Z]{4,12}$/.test(name)) {
          rejected.push({
            name,
            reason: "Candidat pattern non organisationnel.",
          });
          continue;
        }
      }
      const excerpt = excerptAround(input.text, match.index, name.length);
      push({
        name,
        rawName: name,
        domain: null,
        mentionKind: classifyMentionKind({
          excerpt,
          inBody: true,
          citationOnly: false,
        }),
        appearanceOrder: entities.length + 1,
        excerpt,
        confidence: 0.65,
      });
    }
  }

  // Domaine cible en citation (domaine / titre, pas query)
  for (const citation of input.citations ?? []) {
    const domain = citation.domain ?? normalizeDomain(citation.url);
    if (
      brandDomainVariants(input.brand).some(
        (alias) => domain === alias || domain.endsWith(`.${alias}`)
      )
    ) {
      const alreadyInBody = entities.some(
        (entity) =>
          isTargetBrandEntity(entity, input.brand) &&
          entity.mentionKind !== "citation_only"
      );
      if (!alreadyInBody) {
        push({
          name: input.brand.name,
          rawName: input.brand.name,
          domain: input.brand.primaryDomain,
          mentionKind: "citation_only",
          appearanceOrder: null,
          excerpt: citation.url,
          confidence: 0.95,
          skipGenericFilter: true,
        });
      }
    }
  }

  const collapsed = collapseNameFragments(entities);
  const droppedFragments = entities.filter((e) => !collapsed.includes(e));
  for (const frag of droppedFragments) {
    rejected.push({
      name: frag.name,
      reason:
        "Fragment de nom absorbé par une entité plus complète (anti-doublon contextuel).",
    });
  }

  return { entities: collapsed, rejected };
}
