import {
  EDITORIAL_DOMAINS,
  defaultDomainQuotas,
  domainById,
  resolveDomainQuotas,
  totalQuota,
  type DomainQuotaMap,
  type EditorialDomainId,
} from "./domains";

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
  /** Quotas effectifs (domaines activés uniquement). */
  quotas: DomainQuotaMap;
  /** Sélections domaine pour snapshot. */
  domainSelections: DomainSelection[];
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

export function defaultDomainSelections(): DomainSelection[] {
  return EDITORIAL_DOMAINS.map((domain) => ({
    domainId: domain.id,
    enabled: true,
    quota: domain.defaultQuota,
    description: null,
  }));
}

export function defaultResearchConfiguration(): ResearchConfiguration {
  return {
    mode: "domains",
    domains: defaultDomainSelections(),
    researchGoal: "seo",
    requestedCount: totalQuota(defaultDomainQuotas()),
    researchInstructions: null,
    customTopic: null,
  };
}

export function validateResearchConfiguration(input: unknown): {
  ok: true;
  value: ValidatedResearchConfiguration;
} | {
  ok: false;
  error: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Configuration de recherche invalide." };
  }

  const record = input as Record<string, unknown>;
  const mode = record.mode === "free" ? "free" : record.mode === "domains" ? "domains" : null;
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
    if (!ALLOWED_REQUEST_COUNTS.includes(countRaw as (typeof ALLOWED_REQUEST_COUNTS)[number])) {
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
        quotas: defaultDomainQuotas(),
        domainSelections: [],
      },
    };
  }

  // Mode domains
  const selections: DomainSelection[] = [];
  const quotas = resolveDomainQuotas({});
  for (const domain of EDITORIAL_DOMAINS) {
    quotas[domain.id] = 0;
  }

  const domainsInput = Array.isArray(record.domains) ? record.domains : null;
  if (!domainsInput) {
    // fallback default quotas
    const defaults = defaultDomainSelections();
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
      const domainId =
        typeof row.domainId === "string" ? row.domainId : null;
      if (!domainId || !domainById(domainId)) {
        return {
          ok: false,
          error: `Domaine inconnu : ${String(domainId)}.`,
        };
      }
      const enabled = row.enabled !== false;
      const quotaNum = Number(row.quota);
      const quota =
        enabled && Number.isFinite(quotaNum)
          ? Math.max(0, Math.min(30, Math.round(quotaNum)))
          : 0;
      selections.push({
        domainId: domainId as EditorialDomainId,
        enabled: enabled && quota > 0,
        quota: enabled ? quota : 0,
        description: asTrimmedString(row.description, 300),
      });
      quotas[domainId as EditorialDomainId] = enabled ? quota : 0;
    }
  }

  const requestedCount = totalQuota(quotas);
  if (requestedCount <= 0) {
    return {
      ok: false,
      error: "Activez au moins un domaine avec un quota supérieur à 0.",
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
