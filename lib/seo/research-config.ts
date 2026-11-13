import {
  EDITORIAL_DOMAINS,
  defaultDomainQuotas,
  domainById,
  resolveDomainQuotas,
  totalQuota,
  type DomainQuotaMap,
  type EditorialDomain,
  type EditorialDomainId,
} from "./domains";
import { resolveDomainInCatalog } from "./theme-catalog-shared";

export type ResearchMode = "domains" | "free";

export type ResearchGoal = "seo" | "trends" | "problems" | "commercial";

export const RESEARCH_GOALS: Array<{
  id: ResearchGoal;
  label: string;
  description: string;
}> = [
  {
    id: "seo",
    label: "Opportunités SEO/GEO",
    description: "Sujets à potentiel de visibilité éditoriale documentable.",
  },
  {
    id: "trends",
    label: "Tendances émergentes",
    description: "Signaux récents sourcés, sans inventer de tendances.",
  },
  {
    id: "problems",
    label: "Problèmes utilisateurs",
    description: "Freins concrets rencontrés par les cibles B2B.",
  },
  {
    id: "commercial",
    label: "Opportunités commerciales",
    description: "Angles proches d’une intention d’achat ou de décision.",
  },
];

export const ALLOWED_REQUEST_COUNTS = [5, 10, 20, 30] as const;

export type DomainSelection = {
  domainId: EditorialDomainId;
  enabled: boolean;
  quota: number;
  description?: string | null;
};

export type ResearchConfiguration = {
  mode: ResearchMode;
  domains?: DomainSelection[];
  customTopic?: string | null;
  researchGoal: ResearchGoal;
  requestedCount: number;
  researchInstructions?: string | null;
  configId?: string | null;
  customThemeId?: string | null;
  saveAsThemeName?: string | null;
};

export type ValidatedResearchConfiguration = {
  mode: ResearchMode;
  researchGoal: ResearchGoal;
  requestedCount: number;
  researchInstructions: string | null;
  customTopic: string | null;
  configId: string | null;
  customThemeId: string | null;
  /** Quotas effectifs (clés = id catalogue / legacyKey). */
  quotas: DomainQuotaMap;
  /** Sélections domaine pour snapshot. */
  domainSelections: DomainSelection[];
};

export type ValidateResearchOptions = {
  /** Catalogue actif (PostgreSQL). Si omis → domaines historiques (tests / compat). */
  catalog?: EditorialDomain[];
};

const MAX_TOPIC = 200;
const MAX_INSTRUCTIONS = 2000;
const MAX_TOTAL_QUOTA = 30;

function asTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, max);
}

export function researchGoalLabel(goal: ResearchGoal): string {
  return RESEARCH_GOALS.find((item) => item.id === goal)?.label ?? goal;
}

export function defaultDomainSelections(
  catalog: EditorialDomain[] = EDITORIAL_DOMAINS
): DomainSelection[] {
  return catalog.map((domain) => ({
    domainId: domain.id,
    enabled: true,
    quota: domain.defaultQuota,
    description: null,
  }));
}

export function defaultResearchConfiguration(
  catalog: EditorialDomain[] = EDITORIAL_DOMAINS
): ResearchConfiguration {
  return {
    mode: "domains",
    domains: defaultDomainSelections(catalog),
    researchGoal: "seo",
    requestedCount: totalQuota(defaultDomainQuotas(catalog), catalog),
    researchInstructions: null,
    customTopic: null,
  };
}

function resolveKnownDomain(
  domainId: string,
  catalog: EditorialDomain[]
): EditorialDomain | undefined {
  return (
    resolveDomainInCatalog(domainId, catalog) ??
    domainById(domainId, catalog) ??
    domainById(domainId, EDITORIAL_DOMAINS)
  );
}

export function validateResearchConfiguration(
  input: unknown,
  options?: ValidateResearchOptions
): {
  ok: true;
  value: ValidatedResearchConfiguration;
} | {
  ok: false;
  error: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Configuration de recherche invalide." };
  }

  const catalog =
    options?.catalog && options.catalog.length > 0
      ? options.catalog
      : EDITORIAL_DOMAINS;

  const record = input as Record<string, unknown>;
  const mode =
    record.mode === "free"
      ? "free"
      : record.mode === "domains"
        ? "domains"
        : null;
  if (!mode) {
    return { ok: false, error: "Mode de recherche invalide (domains | free)." };
  }

  const goalRaw = record.researchGoal;
  const researchGoal: ResearchGoal | null =
    goalRaw === "seo" ||
    goalRaw === "trends" ||
    goalRaw === "problems" ||
    goalRaw === "commercial"
      ? goalRaw
      : null;
  if (!researchGoal) {
    return {
      ok: false,
      error: "Objectif de recherche invalide (seo | trends | problems | commercial).",
    };
  }

  const researchInstructions = asTrimmedString(
    record.researchInstructions,
    MAX_INSTRUCTIONS
  );
  const configId = asTrimmedString(record.configId, 64);
  const customThemeId = asTrimmedString(record.customThemeId, 64);

  if (mode === "free") {
    const customTopic = asTrimmedString(record.customTopic, MAX_TOPIC);
    if (!customTopic) {
      return { ok: false, error: "Le sujet à explorer est obligatoire." };
    }

    const countRaw = Number(record.requestedCount);
    if (
      !ALLOWED_REQUEST_COUNTS.includes(
        countRaw as (typeof ALLOWED_REQUEST_COUNTS)[number]
      )
    ) {
      return {
        ok: false,
        error: "Nombre d’opportunités invalide (5, 10, 20 ou 30).",
      };
    }

    return {
      ok: true,
      value: {
        mode,
        researchGoal,
        requestedCount: countRaw,
        researchInstructions,
        customTopic,
        configId,
        customThemeId,
        quotas: {},
        domainSelections: [],
      },
    };
  }

  const selections: DomainSelection[] = [];
  const quotas: DomainQuotaMap = {};

  const domainsInput = Array.isArray(record.domains) ? record.domains : null;
  if (!domainsInput) {
    const defaults = defaultDomainSelections(catalog);
    for (const item of defaults) {
      selections.push(item);
      quotas[item.domainId] = item.quota;
    }
  } else {
    for (const raw of domainsInput) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const row = raw as Record<string, unknown>;
      const domainId = typeof row.domainId === "string" ? row.domainId : null;
      if (!domainId) {
        continue;
      }
      const known = resolveKnownDomain(domainId, catalog);
      if (!known) {
        return {
          ok: false,
          error: `Domaine inconnu : ${domainId}.`,
        };
      }
      const resolvedId = known.id;
      const enabled = row.enabled !== false;
      const quotaNum = Number(row.quota);
      const quota =
        enabled && Number.isFinite(quotaNum)
          ? Math.max(0, Math.min(30, Math.round(quotaNum)))
          : 0;
      selections.push({
        domainId: resolvedId,
        enabled: enabled && quota > 0,
        quota: enabled ? quota : 0,
        description: asTrimmedString(row.description, 300),
      });
      quotas[resolvedId] = enabled ? quota : 0;
      if (known.legacyKey && known.legacyKey !== resolvedId) {
        quotas[known.legacyKey] = enabled ? quota : 0;
      }
    }
  }

  const requestedCount = selections.reduce(
    (sum, item) => sum + (item.enabled ? item.quota : 0),
    0
  );
  if (requestedCount <= 0) {
    return {
      ok: false,
      error: "Activez au moins une thématique avec un quota supérieur à 0.",
    };
  }
  if (requestedCount > MAX_TOTAL_QUOTA) {
    return {
      ok: false,
      error: `Quota total trop élevé (max ${MAX_TOTAL_QUOTA}).`,
    };
  }

  return {
    ok: true,
    value: {
      mode,
      researchGoal,
      requestedCount,
      researchInstructions,
      customTopic: null,
      configId,
      customThemeId,
      quotas,
      domainSelections: selections,
    },
  };
}

export function snapshotFromValidated(
  value: ValidatedResearchConfiguration
): Record<string, unknown> {
  return {
    mode: value.mode,
    researchGoal: value.researchGoal,
    requestedCount: value.requestedCount,
    researchInstructions: value.researchInstructions,
    customTopic: value.customTopic,
    configId: value.configId,
    customThemeId: value.customThemeId,
    quotas: value.quotas,
    domains: value.domainSelections,
  };
}

export {
  resolveDomainQuotas,
  defaultDomainQuotas,
  totalQuota,
};
