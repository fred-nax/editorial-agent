/**
 * Domaines éditoriaux Naxialis + quotas de recherche (Phase 1.1).
 * Configurable : surcharge possible via payload API / run.themes.
 */

export type EditorialDomainId =
  | "ai_agents"
  | "wordpress_woo"
  | "seo_geo"
  | "saas_web"
  | "automation_api";

export type EditorialDomain = {
  id: EditorialDomainId;
  label: string;
  defaultQuota: number;
  explorationAngles: string[];
  naxialisServices: string[];
};

export const EDITORIAL_DOMAINS: EditorialDomain[] = [
  {
    id: "ai_agents",
    label: "Intelligence artificielle et agents IA",
    defaultQuota: 5,
    explorationAngles: [
      "Agents autonomes",
      "MCP",
      "RAG",
      "IA pour PME",
      "IA métier",
      "Sécurité des agents",
    ],
    naxialisServices: ["Agents IA", "Automatisation"],
  },
  {
    id: "wordpress_woo",
    label: "WordPress et WooCommerce",
    defaultQuota: 4,
    explorationAngles: [
      "WordPress headless",
      "Sécurité",
      "Performance",
      "Commerce composable",
      "WooCommerce",
      "API REST",
    ],
    naxialisServices: ["WordPress / WooCommerce", "Développement web"],
  },
  {
    id: "seo_geo",
    label: "SEO et GEO",
    defaultQuota: 4,
    explorationAngles: [
      "Référencement naturel",
      "Recherche générative",
      "Visibilité dans les moteurs IA",
      "SEO technique",
      "Données structurées",
      "Stratégie de contenu",
    ],
    naxialisServices: ["SEO / GEO"],
  },
  {
    id: "saas_web",
    label: "SaaS et développement web",
    defaultQuota: 4,
    explorationAngles: [
      "Applications SaaS B2B",
      "Applications métier",
      "Next.js",
      "Architectures web",
      "Développement sur mesure",
      "Modernisation des outils d'entreprise",
    ],
    naxialisServices: ["SaaS sur mesure", "Développement web"],
  },
  {
    id: "automation_api",
    label: "Automatisation et intégrations API",
    defaultQuota: 3,
    explorationAngles: [
      "n8n",
      "Make",
      "Workflows métier",
      "Intégrations ERP/CRM",
      "Automatisation documentaire",
      "Connexion entre applications",
    ],
    naxialisServices: ["Automatisation", "API et intégrations"],
  },
];

export type DomainQuotaMap = Record<EditorialDomainId, number>;

export function defaultDomainQuotas(): DomainQuotaMap {
  return Object.fromEntries(
    EDITORIAL_DOMAINS.map((domain) => [domain.id, domain.defaultQuota])
  ) as DomainQuotaMap;
}

export function totalQuota(quotas: DomainQuotaMap): number {
  return EDITORIAL_DOMAINS.reduce(
    (sum, domain) => sum + (quotas[domain.id] ?? 0),
    0
  );
}

/** Normalise une surcharge partielle de quotas (entiers ≥ 0). */
export function resolveDomainQuotas(
  override?: Partial<Record<string, number>> | null
): DomainQuotaMap {
  const base = defaultDomainQuotas();
  if (!override || typeof override !== "object") {
    return base;
  }
  for (const domain of EDITORIAL_DOMAINS) {
    const value = override[domain.id] ?? override[domain.label];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      base[domain.id] = Math.min(20, Math.round(value));
    }
  }
  return base;
}

export function domainByLabel(label: string): EditorialDomain | undefined {
  const needle = label.trim().toLowerCase();
  return EDITORIAL_DOMAINS.find((domain) => domain.label.toLowerCase() === needle);
}

export function domainById(id: string): EditorialDomain | undefined {
  return EDITORIAL_DOMAINS.find((domain) => domain.id === id);
}

/** Labels de thématiques du catalogue Phase 1.1. */
export const SEO_THEME_LABELS: string[] = EDITORIAL_DOMAINS.map(
  (domain) => domain.label
);

const THEME_ALIASES: Record<string, string> = {
  "applications saas": "SaaS et développement web",
  "technologies web émergentes": "SaaS et développement web",
  "automatisation des entreprises": "Automatisation et intégrations API",
  "api et intégrations": "Automatisation et intégrations API",
  "intelligence artificielle et agents ia":
    "Intelligence artificielle et agents IA",
  "wordpress et woocommerce": "WordPress et WooCommerce",
  "seo et geo": "SEO et GEO",
  "saas et développement web": "SaaS et développement web",
  "automatisation et intégrations api": "Automatisation et intégrations API",
};

export function normalizeThemeLabel(theme: string): string {
  const needle = theme.trim().toLowerCase();
  if (THEME_ALIASES[needle]) {
    return THEME_ALIASES[needle];
  }
  const known = SEO_THEME_LABELS.find((item) => item.toLowerCase() === needle);
  return known ?? theme.trim();
}
