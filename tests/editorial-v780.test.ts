import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { buildArticlePrompt } from "../lib/agent/prompt";
import { formatInternalLinksForPrompt } from "../lib/agent/internal-links/plan";
import { detectCategories } from "../lib/categories";
import {
  editorialPromptPhrases,
  resolveEditorialIdentity,
} from "../lib/editorial/identity";
import {
  assertCategoryIdsBelongToSite,
  detectCategoriesFromAllowed,
  filterCategoryIdsForCurrentSite,
  parseAllowedCategoryIds,
  parseSyncedCategoriesJson,
  resolveCategoriesForSubject,
  type SyncedWpCategory,
} from "../lib/wordpress-categories";

const CLIENT_CATS: SyncedWpCategory[] = [
  {
    id: 10,
    name: "Intelligence artificielle",
    slug: "intelligence-artificielle",
    count: 12,
    description: "Agents IA, LLM et automatisation",
  },
  {
    id: 20,
    name: "WordPress",
    slug: "wordpress",
    count: 8,
    description: "CMS et WooCommerce",
  },
  {
    id: 30,
    name: "SEO",
    slug: "seo",
    count: 3,
    description: "Référencement et GEO",
  },
];

describe("V7.8.0 — identité éditoriale", () => {
  it("conserve Naxialis pour naxialis.com", () => {
    const identity = resolveEditorialIdentity({
      wpUrl: "https://naxialis.com",
      siteName: "Autre",
      clientName: "Client",
    });
    assert.equal(identity.isNaxialisLegacy, true);
    assert.equal(identity.brandName, "Naxialis");
    assert.match(identity.blogLabel, /Naxialis/);
    const phrases = editorialPromptPhrases(identity);
    assert.match(phrases.articleIntro, /blog Naxialis/);
    assert.match(phrases.linkingEmpty, /naxialis\.com/);
  });

  it("utilise siteName pour une installation cliente", () => {
    const identity = resolveEditorialIdentity({
      wpUrl: "https://client-exemple.fr",
      siteName: "Acme Digital",
      clientName: "Acme",
    });
    assert.equal(identity.isNaxialisLegacy, false);
    assert.equal(identity.brandName, "Acme Digital");
    const phrases = editorialPromptPhrases(identity);
    assert.match(phrases.articleIntro, /Acme Digital/);
    assert.doesNotMatch(phrases.articleIntro, /Naxialis/i);
    assert.doesNotMatch(phrases.titlesIntro, /Naxialis/i);
    assert.doesNotMatch(phrases.freeTopicCatalog, /Naxialis/i);
  });

  it("n’injecte pas Naxialis dans le prompt article client", () => {
    const identity = resolveEditorialIdentity({
      wpUrl: "https://blog.client.io",
      siteName: "Blog Client",
      clientName: null,
    });
    const prompt = buildArticlePrompt("Sujet test", null, identity);
    assert.doesNotMatch(prompt, /Naxialis/i);
    assert.doesNotMatch(prompt, /naxialis\.com/i);
    assert.match(prompt, /Blog Client/);
  });

  it("conserve le prompt Naxialis historique par défaut", () => {
    const prompt = buildArticlePrompt("Sujet test");
    assert.match(prompt, /blog Naxialis/);
    const emptyPlan = formatInternalLinksForPrompt({
      subject: "x",
      themes: [],
      catalogSize: 0,
      catalogStale: false,
      candidates: [],
      selected: [],
      rejected: [],
      minScore: 0.28,
      maxLinks: 4,
    });
    assert.match(emptyPlan, /naxialis\.com/);
  });
});

describe("V7.8.0 — catégories WordPress dynamiques", () => {
  it("parse le snapshot et les IDs autorisés", () => {
    const json = JSON.stringify(CLIENT_CATS);
    assert.equal(parseSyncedCategoriesJson(json).length, 3);
    assert.deepEqual(parseAllowedCategoryIds("[10,20,20,0,-1]"), [10, 20]);
    assert.deepEqual(parseAllowedCategoryIds("not-json"), []);
  });

  it("refuse les IDs d’un autre WordPress", () => {
    const filtered = filterCategoryIdsForCurrentSite({
      ids: [10, 99],
      categories: CLIENT_CATS,
      categoriesOrigin: "https://old.example",
      effectiveWpOrigin: "https://new.example",
    });
    assert.deepEqual(filtered, []);

    assert.throws(
      () =>
        assertCategoryIdsBelongToSite({
          ids: [10],
          categories: CLIENT_CATS,
          categoriesOrigin: "https://old.example",
          effectiveWpOrigin: "https://new.example",
        }),
      /ne correspondent pas/
    );

    assert.throws(
      () =>
        assertCategoryIdsBelongToSite({
          ids: [99],
          categories: CLIENT_CATS,
          categoriesOrigin: "https://client-exemple.fr",
          effectiveWpOrigin: "https://client-exemple.fr",
        }),
      /inconnu/
    );
  });

  it("sélectionne les catégories autorisées par score (pas toute la whitelist)", () => {
    const matches = detectCategoriesFromAllowed({
      subject: "Guide pratique d’intelligence artificielle pour les PME",
      categories: CLIENT_CATS,
      allowedIds: [10, 20, 30],
      defaultCategoryId: 20,
      categoriesOrigin: "https://client-exemple.fr",
      effectiveWpOrigin: "https://client-exemple.fr",
    });
    assert.ok(matches.some((item) => item.categoryId === 10));
    assert.ok(matches.length <= 3);
    assert.ok(!matches.some((item) => item.categoryId === 30));
  });

  it("utilise la catégorie par défaut sans correspondance", () => {
    const matches = detectCategoriesFromAllowed({
      subject: "Sujet sans lien thématique",
      categories: CLIENT_CATS,
      allowedIds: [10, 20],
      defaultCategoryId: 20,
      categoriesOrigin: "https://client-exemple.fr",
      effectiveWpOrigin: "https://client-exemple.fr",
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.categoryId, 20);
  });

  it("renvoie vide si aucune catégorie autorisée", () => {
    const matches = detectCategoriesFromAllowed({
      subject: "WordPress",
      categories: CLIENT_CATS,
      allowedIds: [],
      defaultCategoryId: null,
      categoriesOrigin: "https://client-exemple.fr",
      effectiveWpOrigin: "https://client-exemple.fr",
    });
    assert.deepEqual(matches, []);
  });

  it("conserve le comportement historique Naxialis (CATEGORY_MAP)", () => {
    const legacy = detectCategories("Agent IA et WordPress headless");
    const resolved = resolveCategoriesForSubject({
      subject: "Agent IA et WordPress headless",
      isNaxialisLegacy: true,
      config: null,
      effectiveWpOrigin: "https://naxialis.com",
    });
    assert.deepEqual(
      resolved.map((item) => item.categoryId),
      legacy.map((item) => item.categoryId)
    );
    assert.ok(resolved.some((item) => item.categoryId === 149));
  });

  it("utilise le mode dynamique pour une installation cliente", () => {
    const resolved = resolveCategoriesForSubject({
      subject: "Guide SEO technique",
      isNaxialisLegacy: false,
      config: {
        categories: CLIENT_CATS,
        allowedIds: [10, 30],
        defaultCategoryId: 10,
        syncedAt: new Date().toISOString(),
        origin: "https://client-exemple.fr",
      },
      effectiveWpOrigin: "https://client-exemple.fr",
    });
    assert.ok(resolved.some((item) => item.categoryId === 30));
    assert.ok(!resolved.some((item) => item.categoryId === 133));
  });
});

describe("V7.8.0 — pagination sync + seed thèmes (contrats code)", () => {
  it("la sync catégories gère la pagination X-WP-TotalPages", () => {
    const source = readFileSync(
      resolve("lib/wordpress-categories.ts"),
      "utf8"
    );
    assert.match(source, /X-WP-TotalPages/);
    assert.match(source, /per_page/);
    assert.match(source, /page=/);
    assert.match(source, /hide_empty=false/);
  });

  it("le boot et le catalogue SEO ne seedent pas les thèmes Naxialis pour un client neutre", () => {
    const boot = readFileSync(resolve("lib/boot.ts"), "utf8");
    const policy = readFileSync(
      resolve("lib/seo/theme-seed-policy.ts"),
      "utf8"
    );
    const catalog = readFileSync(resolve("lib/seo/theme-catalog.ts"), "utf8");
    assert.match(boot, /shouldSeedHistoricalEditorialThemes/);
    assert.match(policy, /isNaxialisWpHost/);
    assert.match(policy, /legacyKey/);
    assert.match(catalog, /shouldSeedHistoricalEditorialThemes/);
  });

  it("ensureHistoricalThemes ne réactive pas une thématique désactivée", () => {
    const catalog = readFileSync(resolve("lib/seo/theme-catalog.ts"), "utf8");
    // Rapprochement par nom : uniquement legacyKey (pas de réécriture de active).
    assert.match(catalog, /data: \{ legacyKey \}/);
    assert.match(
      catalog,
      /sans modifier name\/description\/angles\/quota\/active\/sortOrder/
    );
  });

  it("create_wordpress_draft reste exclusivement en brouillon", () => {
    const wp = readFileSync(resolve("lib/wordpress.ts"), "utf8");
    assert.match(wp, /status:\s*"draft"/);
    assert.doesNotMatch(wp, /status:\s*"publish"/);
  });

  it("changement WP invalide le snapshot catégories", () => {
    const settings = readFileSync(
      resolve("lib/settings/app-settings.ts"),
      "utf8"
    );
    assert.match(settings, /emptyCategoryFields/);
    assert.match(settings, /inventoryValid = false/);
  });

  it("les routes catégories sont protégées Auth.js", () => {
    const route = readFileSync(
      resolve("app/api/settings/categories/route.ts"),
      "utf8"
    );
    const sync = readFileSync(
      resolve("app/api/settings/categories/sync/route.ts"),
      "utf8"
    );
    assert.match(route, /requireAuth/);
    assert.match(sync, /requireAuth/);
  });

  it("sujet libre SEO sans catalogue Naxialis forcé", () => {
    const search = readFileSync(
      resolve("lib/seo/opportunity-search.ts"),
      "utf8"
    );
    assert.match(search, /catalogue thématique fixe/);
    assert.doesNotMatch(
      search,
      /ne le force PAS dans un catalogue Naxialis/
    );
  });
});

describe("V7.8.0 — politique seed thèmes (unité pure)", () => {
  it("isNaxialisWpHost détecte uniquement naxialis.com", async () => {
    const { isNaxialisWpHost, siteHostFromUrl } = await import(
      "../lib/editorial/identity"
    );
    assert.equal(isNaxialisWpHost(siteHostFromUrl("https://naxialis.com")), true);
    assert.equal(
      isNaxialisWpHost(siteHostFromUrl("https://www.naxialis.com/blog")),
      true
    );
    assert.equal(
      isNaxialisWpHost(siteHostFromUrl("https://client.fr")),
      false
    );
  });
});
