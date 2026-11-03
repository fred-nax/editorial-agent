import { normalizeDomain } from "./constants";
import { parseAliasList, parseKnownCompetitors } from "./entities";

export type BrandInput = {
  name: string;
  primaryDomain: string;
  description?: string | null;
  sector?: string | null;
  products?: string | null;
  country?: string;
  language?: string;
  aliases?: unknown;
  domainAliases?: unknown;
  knownCompetitors?: unknown;
};

export function validateBrandInput(input: unknown): {
  ok: true;
  value: {
    name: string;
    primaryDomain: string;
    description: string | null;
    sector: string | null;
    products: string | null;
    country: string;
    language: string;
    aliases: string[];
    domainAliases: string[];
    knownCompetitors: Array<{ name: string; domain?: string | null }>;
  };
} | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Payload marque invalide." };
  }
  const record = input as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const domainRaw =
    typeof record.primaryDomain === "string" ? record.primaryDomain.trim() : "";
  if (!name || name.length > 120) {
    return { ok: false, error: "Nom de marque obligatoire (max 120)." };
  }
  if (!domainRaw || domainRaw.length > 200) {
    return { ok: false, error: "Domaine principal obligatoire." };
  }
  const primaryDomain = normalizeDomain(domainRaw);
  if (!primaryDomain || !primaryDomain.includes(".")) {
    return { ok: false, error: "Domaine principal invalide." };
  }

  return {
    ok: true,
    value: {
      name,
      primaryDomain,
      description:
        typeof record.description === "string"
          ? record.description.trim().slice(0, 2000) || null
          : null,
      sector:
        typeof record.sector === "string"
          ? record.sector.trim().slice(0, 120) || null
          : null,
      products:
        typeof record.products === "string"
          ? record.products.trim().slice(0, 2000) || null
          : null,
      country:
        typeof record.country === "string" && record.country.trim()
          ? record.country.trim().slice(0, 8)
          : "FR",
      language:
        typeof record.language === "string" && record.language.trim()
          ? record.language.trim().slice(0, 8)
          : "fr",
      aliases: parseAliasList(record.aliases),
      domainAliases: parseAliasList(record.domainAliases).map(normalizeDomain),
      knownCompetitors: parseKnownCompetitors(record.knownCompetitors),
    },
  };
}
