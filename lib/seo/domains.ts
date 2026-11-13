/**
 * Domaines éditoriaux historiques (seed V7.5) + helpers de normalisation.
 * Le catalogue runtime est PostgreSQL (`CustomTheme`) via `theme-catalog.ts`.
 * Ces constantes restent la source de vérité pour l’initialisation idempotente
 * et la compatibilité des anciennes configurations (legacyKey).
 */

export type EditorialDomainId = string;

export type EditorialDomain = {
  /** Identifiant runtime : CustomTheme.id ou legacyKey historique. */
  id: EditorialDomainId;
  label: string;
  defaultQuota: number;
  explorationAngles: string[];
  naxialisServices: string[];
  description?: string | null;
  legacyKey?: string | null;
  active?: boolean;
  sortOrder?: number;
};

/**
 * Cinq domaines historiques Naxialis — seed uniquement.
 * Ne plus utiliser comme source runtime exclusive après V7.5.
 */
export const EDITORIAL_DOMAINS: EditorialDomain[] = [
  {
    id: "ai_agents",
    legacyKey: "ai_agents",
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
    sortOrder: 0,
  },
  {
    id: "wordpress_woo",
    legacyKey: "wordpress_woo",
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
    sortOrder: 1,
  },
  {
    id: "seo_geo",
    legacyKey: "seo_geo",
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
    sortOrder: 2,
  },
  {
    id: "saas_web",
    legacyKey: "saas_web",
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
    sortOrder: 3,
  },
  {
    id: "automation_api",
    legacyKey: "automation_api",
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
    sortOrder: 4,
  },
];

/** Alias explicite pour le seed / la doc. */
export const HISTORICAL_EDITORIAL_DOMAINS = EDITORIAL_DOMAINS;

export type DomainQuotaMap = Record<string, number>;

export function defaultDomainQuotas(
  catalog: EditorialDomain[] = EDITORIAL_DOMAINS
): DomainQuotaMap {
  return Object.fromEntries(
    catalog.map((domain) => [domain.id, domain.defaultQuota])
  );
}

export function totalQuota(
  quotas: DomainQuotaMap,
  catalog: EditorialDomain[] = EDITORIAL_DOMAINS
): number {
  return catalog.reduce((sum, domain) => sum + (quotas[domain.id] ?? 0), 0);
}

/** Normalise une surcharge partielle de quotas (entiers ≥ 0). */
export function resolveDomainQuotas(
  override?: Partial<Record<string, number>> | null,
  catalog: EditorialDomain[] = EDITORIAL_DOMAINS
): DomainQuotaMap {
  const base = defaultDomainQuotas(catalog);
  if (!override || typeof override !== "object") {
    return base;
  }
  for (const domain of catalog) {
    const value =
      override[domain.id] ??
      (domain.legacyKey ? override[domain.legacyKey] : undefined) ??
      override[domain.label];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      base[domain.id] = Math.min(20, Math.round(value));
    }
  }
  return base;
}

export function domainByLabel(
  label: string,
  catalog: EditorialDomain[] = EDITORIAL_DOMAINS
): EditorialDomain | undefined {
  const needle = label.trim().toLowerCase();
  return catalog.find((domain) => domain.label.toLowerCase() === needle);
}

export function domainById(
  id: string,
  catalog: EditorialDomain[] = EDITORIAL_DOMAINS
): EditorialDomain | undefined {
  return catalog.find(
    (domain) => domain.id === id || domain.legacyKey === id
  );
}

/** Labels de thématiques du catalogue historique (seed). */
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

export function normalizeThemeLabel(
  theme: string,
  catalogLabels: string[] = SEO_THEME_LABELS
): string {
  const needle = theme.trim().toLowerCase();
  if (THEME_ALIASES[needle]) {
    return THEME_ALIASES[needle];
  }
  const known = catalogLabels.find((item) => item.toLowerCase() === needle);
  return known ?? theme.trim();
}

export function historicalLegacyKeys(): string[] {
  return EDITORIAL_DOMAINS.map((domain) => domain.legacyKey ?? domain.id);
}
