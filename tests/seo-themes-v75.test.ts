import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  EDITORIAL_DOMAINS,
  HISTORICAL_EDITORIAL_DOMAINS,
  domainById,
  normalizeThemeLabel,
} from "../lib/seo/domains";
import {
  defaultResearchConfiguration,
  validateResearchConfiguration,
} from "../lib/seo/research-config";
import {
  MAX_THEME_ANGLES,
  MAX_THEME_QUOTA,
  SEO_NO_ACTIVE_THEMES_ERROR,
  customThemeToDomain,
  requireActiveThemesForDomainsSearch,
  validateThemeAngles,
  validateThemeQuota,
  normalizeThemeName,
} from "../lib/seo/theme-catalog-shared";
import type { CustomTheme } from "@prisma/client";

function fakeTheme(overrides: Partial<CustomTheme> = {}): CustomTheme {
  return {
    id: "theme_cuid_1",
    name: "Cybersécurité",
    description: "Sécurité web et API",
    active: true,
    legacyKey: null,
    explorationAngles: ["Audits", "Conformité"],
    defaultQuota: 6,
    sortOrder: 10,
    naxialisServices: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("V7.5 — catalogue thématiques SEO", () => {
  it("conserve les cinq domaines historiques et leurs quotas", () => {
    assert.equal(HISTORICAL_EDITORIAL_DOMAINS.length, 5);
    assert.equal(EDITORIAL_DOMAINS.length, 5);
    assert.deepEqual(
      EDITORIAL_DOMAINS.map((domain) => domain.legacyKey ?? domain.id),
      [
        "ai_agents",
        "wordpress_woo",
        "seo_geo",
        "saas_web",
        "automation_api",
      ]
    );
    assert.deepEqual(
      EDITORIAL_DOMAINS.map((domain) => domain.defaultQuota),
      [5, 4, 4, 4, 3]
    );
    for (const domain of EDITORIAL_DOMAINS) {
      assert.ok(domain.explorationAngles.length >= 4);
      assert.ok(domain.label.length > 3);
    }
  });

  it("normalise les alias historiques sans inventer de thèmes", () => {
    assert.equal(
      normalizeThemeLabel("seo et geo"),
      "SEO et GEO"
    );
    assert.equal(
      normalizeThemeLabel("Cybersécurité des PME"),
      "Cybersécurité des PME"
    );
  });

  it("mappe CustomTheme vers EditorialDomain", () => {
    const domain = customThemeToDomain(fakeTheme());
    assert.equal(domain.id, "theme_cuid_1");
    assert.equal(domain.label, "Cybersécurité");
    assert.equal(domain.defaultQuota, 6);
    assert.deepEqual(domain.explorationAngles, ["Audits", "Conformité"]);
  });

  it("refuse le mode multi-thématiques sans thématique active", () => {
    assert.throws(
      () => requireActiveThemesForDomainsSearch([]),
      (error: unknown) =>
        error instanceof Error &&
        error.message === SEO_NO_ACTIVE_THEMES_ERROR
    );
    const domain = customThemeToDomain(fakeTheme({ active: true }));
    assert.deepEqual(requireActiveThemesForDomainsSearch([domain]), [domain]);
  });

  it("conserve legacyKey dans la validation de configuration", () => {
    const catalog = EDITORIAL_DOMAINS.map((domain) => ({
      ...domain,
      id: `cuid_${domain.legacyKey ?? domain.id}`,
    }));
    const legacyId = EDITORIAL_DOMAINS[0].legacyKey ?? EDITORIAL_DOMAINS[0].id;
    const validated = validateResearchConfiguration(
      {
        mode: "domains",
        researchGoal: "seo",
        domains: [{ domainId: legacyId, enabled: true, quota: 3 }],
      },
      { catalog }
    );
    assert.equal(validated.ok, true);
    if (validated.ok) {
      assert.equal(
        validated.value.domainSelections[0]?.domainId,
        catalog[0].id
      );
      assert.ok(validated.value.quotas[legacyId] === 3);
    }

    const free = validateResearchConfiguration({
      mode: "free",
      researchGoal: "seo",
      customTopic: "Sujet libre indépendant",
      requestedCount: 5,
    });
    assert.equal(free.ok, true);
  });

  it("valide angles et quotas", () => {
    assert.equal(validateThemeAngles(["A", "B"]).ok, true);
    assert.equal(validateThemeAngles(null).ok, true);
    assert.equal(
      validateThemeAngles(Array.from({ length: MAX_THEME_ANGLES + 1 }, () => "x"))
        .ok,
      false
    );
    assert.equal(validateThemeQuota(5).ok, true);
    assert.equal(validateThemeQuota(MAX_THEME_QUOTA + 1).ok, false);
    assert.equal(normalizeThemeName("  Cybersécurité  "), "Cybersécurité");
    assert.equal(normalizeThemeName("   "), null);
  });

  it("valide une recherche sur catalogue dynamique uniquement actif", () => {
    const catalog = [
      customThemeToDomain(fakeTheme()),
      customThemeToDomain(
        fakeTheme({
          id: "theme_cuid_2",
          name: "Cloud",
          defaultQuota: 4,
          explorationAngles: ["IaaS"],
        })
      ),
    ];
    const ok = validateResearchConfiguration(
      {
        mode: "domains",
        researchGoal: "seo",
        domains: [
          { domainId: "theme_cuid_1", enabled: true, quota: 5 },
          { domainId: "theme_cuid_2", enabled: true, quota: 5 },
        ],
      },
      { catalog }
    );
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.requestedCount, 10);
    }

    const bad = validateResearchConfiguration(
      {
        mode: "domains",
        researchGoal: "seo",
        domains: [{ domainId: "unknown", enabled: true, quota: 3 }],
      },
      { catalog }
    );
    assert.equal(bad.ok, false);
  });

  it("accepte les legacyKey historiques sans catalogue DB (compat tests)", () => {
    const result = validateResearchConfiguration({
      mode: "domains",
      researchGoal: "seo",
      domains: [
        { domainId: "seo_geo", enabled: true, quota: 10 },
        { domainId: "ai_agents", enabled: false, quota: 0 },
        { domainId: "wordpress_woo", enabled: false, quota: 0 },
        { domainId: "saas_web", enabled: false, quota: 0 },
        { domainId: "automation_api", enabled: false, quota: 0 },
      ],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.requestedCount, 10);
      assert.ok(domainById("seo_geo"));
    }
  });

  it("conserve le mode sujet libre sans forcer une thématique", () => {
    const result = validateResearchConfiguration({
      mode: "free",
      researchGoal: "problems",
      customTopic: "Impression 3D industrielle",
      requestedCount: 10,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.mode, "free");
      assert.equal(result.value.domainSelections.length, 0);
      assert.equal(result.value.customTopic, "Impression 3D industrielle");
    }
  });

  it("defaults historiques restent stables", () => {
    const config = defaultResearchConfiguration();
    assert.equal(config.mode, "domains");
    assert.equal(config.domains?.length, 5);
  });
});

describe("V7.5 — seed & compatibilité (contrats code)", () => {
  it("expose une procédure d’ensure idempotente et un script de seed", async () => {
    const catalog = await readFile("lib/seo/theme-catalog.ts", "utf8");
    assert.match(catalog, /ensureHistoricalEditorialThemes/);
    assert.match(catalog, /legacyKey/);
    assert.match(catalog, /Ne jamais écraser|sans modifier name/i);
    assert.match(catalog, /backfillOpportunityThemeIds/);
    assert.match(catalog, /getThemeDependencies/);
    assert.match(catalog, /canDelete/);

    const script = await readFile("scripts/seed-editorial-themes.ts", "utf8");
    assert.match(script, /ensureHistoricalEditorialThemes/);
    assert.match(script, /backfillOpportunityThemeIds/);
  });

  it("migration additive V7.5 présente et sans drop destructif", async () => {
    const sql = await readFile(
      "prisma/migrations/20261113120000_seo_themes_catalog_v75/migration.sql",
      "utf8"
    );
    assert.match(sql, /CustomTheme/);
    assert.match(sql, /legacyKey/);
    assert.match(sql, /explorationAngles/);
    assert.match(sql, /defaultQuota/);
    assert.match(sql, /sortOrder/);
    assert.match(sql, /themeId/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql, /drop_ai_visibility_monitor/i);
  });

  it("exclut la migration drop_ai_visibility_monitor des artefacts Git/Docker", async () => {
    const gitignore = await readFile(".gitignore", "utf8");
    const dockerignore = await readFile(".dockerignore", "utf8");
    assert.match(gitignore, /drop_ai_visibility_monitor/);
    assert.match(dockerignore, /drop_ai_visibility_monitor/);
    const v75 = await readFile(
      "prisma/migrations/20261113120000_seo_themes_catalog_v75/migration.sql",
      "utf8"
    );
    assert.doesNotMatch(v75, /VisibilityBrand|DROP TABLE/i);
  });

  it("API custom-themes étendue (liste, CRUD, ordre, deps)", async () => {
    const list = await readFile("app/api/custom-themes/route.ts", "utf8");
    const one = await readFile("app/api/custom-themes/[id]/route.ts", "utf8");
    const reorder = await readFile(
      "app/api/custom-themes/reorder/route.ts",
      "utf8"
    );
    for (const source of [list, one, reorder]) {
      assert.match(source, /requireAuth/);
    }
    assert.match(one, /getThemeDependencies/);
    assert.match(one, /syncOpportunityThemeLabel/);
    assert.match(one, /deactivated/);
    assert.match(reorder, /reorderThemes/);
  });

  it("moteur SEO lit le catalogue dynamique", async () => {
    const search = await readFile("lib/seo/opportunity-search.ts", "utf8");
    assert.match(search, /loadEditorialCatalogForSearch/);
    assert.match(search, /requireActiveThemesForDomainsSearch/);
    assert.match(search, /themeId/);
    assert.match(search, /themeCatalog/);
    assert.doesNotMatch(
      search,
      /activeCatalog\.length > 0 \? activeCatalog : EDITORIAL_DOMAINS/
    );
    assert.doesNotMatch(
      search,
      /fullCatalog\.length > 0 \? fullCatalog : EDITORIAL_DOMAINS/
    );
    assert.doesNotMatch(search, /createWordPressDraft/);
    assert.doesNotMatch(search, /OPENAI_AGENT_ID/);
  });

  it("API POST n’utilise plus le fallback silencieux EDITORIAL_DOMAINS", async () => {
    const route = await readFile("app/api/opportunities/route.ts", "utf8");
    assert.match(route, /loadEditorialCatalogForSearch/);
    assert.match(route, /requireActiveThemesForDomainsSearch/);
    assert.doesNotMatch(
      route,
      /catalog\.length > 0 \? catalog : undefined/
    );
    assert.doesNotMatch(
      route,
      /activeDomains\.length > 0 \? activeDomains : undefined/
    );
  });

  it("UI expose gestion + filtre catalogue", async () => {
    const board = await readFile("components/OpportunitiesBoard.tsx", "utf8");
    const manager = await readFile(
      "components/opportunities/theme-manager-dialog.tsx",
      "utf8"
    );
    const modal = await readFile("components/ResearchConfigModal.tsx", "utf8");
    assert.match(board, /ThemeManagerDialog/);
    assert.match(board, /Gérer les thématiques|ThemeManagerDialog/);
    assert.doesNotMatch(board, /EDITORIAL_DOMAINS\.map/);
    assert.match(manager, /Settings2/);
    assert.match(manager, /AlertDialog/);
    assert.match(manager, /Organisez les domaines éditoriaux/);
    assert.match(manager, /MoreHorizontal/);
    assert.match(manager, /Abandonner les modifications/);
    assert.match(manager, /max-w-\[60rem\]/);
    assert.match(modal, /Thématiques configurées/);
    assert.match(modal, /Gérer les thématiques/);
    assert.match(modal, /CircleHelp/);
    assert.match(modal, /Options/);
    assert.match(modal, /onManageThemes/);
    assert.match(modal, /mergeDomainsWithCatalog/);
    assert.match(modal, /preserveDraftRef/);
    assert.doesNotMatch(modal, /from \"@\/lib\/seo\/domains\"/);
    assert.doesNotMatch(modal, /EDITORIAL_DOMAINS/);
  });

  it("ne modifie pas l’agent éditorial ni create_wordpress_draft", async () => {
    const agentFiles = [
      "lib/seo/opportunity-search.ts",
      "lib/seo/theme-catalog.ts",
      "lib/seo/research-config.ts",
      "components/opportunities/theme-manager-dialog.tsx",
    ];
    for (const file of agentFiles) {
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, /create_wordpress_draft/);
      assert.doesNotMatch(source, /createWordPressDraft/);
      assert.doesNotMatch(source, /OPENAI_AGENT_ID/);
    }
  });

  it("boot assure les thèmes sans reset destructif", async () => {
    const boot = await readFile("lib/boot.ts", "utf8");
    assert.match(boot, /ensureHistoricalEditorialThemes/);
    assert.doesNotMatch(boot, /deleteMany\(\s*\{\s*\}\s*\)/);
    assert.doesNotMatch(boot, /migrate reset/);
  });

  it("schéma Prisma conserve theme string + themeId optionnel", async () => {
    const schema = await readFile("prisma/schema.prisma", "utf8");
    assert.match(schema, /model CustomTheme/);
    assert.match(schema, /legacyKey/);
    assert.match(schema, /explorationAngles/);
    assert.match(schema, /defaultQuota/);
    assert.match(schema, /sortOrder/);
    assert.match(schema, /themeId\s+String\?/);
    assert.match(schema, /theme\s+String/);
  });
});

describe("V7.5 — règles de rapprochement seed (unit)", () => {
  it("documente la priorité legacyKey puis nom, sans écrasement", async () => {
    const source = await readFile("lib/seo/theme-catalog.ts", "utf8");
    assert.match(source, /Règles de rapprochement/);
    assert.match(source, /legacyKey/);
    assert.match(source, /d[eé]jà présent/);
    assert.match(source, /Nom existant/);
    assert.match(source, /sans modifier name/);
    assert.match(source, /angles\/quota/);
  });
});
