import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectCategories } from "../lib/categories";
import {
  detectCategoriesFromAllowed,
  filterCategoryIdsForCurrentSite,
  MAX_DYNAMIC_CATEGORIES,
  resolveCategoriesForSubject,
  sanitizeCategoryIdsForWordPress,
  scoreCategoryAgainstSubject,
  type SyncedWpCategory,
} from "../lib/wordpress-categories";

const ORIGIN = "https://naxialis.com";

/** Catalogue représentatif (IDs Naxialis / proches) pour les scénarios d’attribution. */
const CATALOG: SyncedWpCategory[] = [
  {
    id: 14,
    name: "WordPress",
    slug: "wordpress",
    count: 40,
    description: "CMS WordPress et extensions",
  },
  {
    id: 116,
    name: "WooCommerce",
    slug: "woocommerce",
    count: 20,
    description: "Boutique e-commerce WooCommerce",
  },
  {
    id: 133,
    name: "SEO / GEO",
    slug: "seo-geo",
    count: 15,
    description: "Référencement et GEO",
  },
  {
    id: 138,
    name: "Intelligence artificielle",
    slug: "intelligence-artificielle",
    count: 25,
    description: "IA, LLM et usages métiers",
  },
  {
    id: 139,
    name: "Outils & Automatisation",
    slug: "outils-automatisation",
    count: 12,
    description: "Automatiser les processus métier",
  },
  {
    id: 140,
    name: "WordPress headless",
    slug: "wordpress-headless",
    count: 8,
    description: "WordPress découplé et API",
  },
  {
    id: 142,
    name: "API et intégrations",
    slug: "api-et-integrations",
    count: 10,
    description: "REST API, webhooks et connecteurs",
  },
  {
    id: 143,
    name: "Commerce headless",
    slug: "commerce-headless",
    count: 4,
    description: "E-commerce headless",
  },
  {
    id: 147,
    name: "RAG",
    slug: "rag",
    count: 6,
    description: "Retrieval Augmented Generation",
  },
  {
    id: 149,
    name: "Agents IA",
    slug: "agents-ia",
    count: 18,
    description: "Agents intelligents et orchestration",
  },
  {
    id: 200,
    name: "IA prédictive",
    slug: "ia-predictive",
    count: 3,
    description: "Prévisions et modèles prédictifs",
  },
  {
    id: 201,
    name: "Comprendre l'IA",
    slug: "comprendre-ia",
    count: 5,
    description: "Pédagogie autour de l'intelligence artificielle",
  },
  {
    id: 202,
    name: "Actualités IA",
    slug: "actualites-ia",
    count: 7,
    description: "Veille et actualités IA",
  },
  {
    id: 203,
    name: "Cybersécurité",
    slug: "cybersecurite",
    count: 9,
    description: "Sécurité des systèmes et API",
  },
];

const ALL_ALLOWED = CATALOG.map((item) => item.id);

function namesOf(
  matches: { categoryId: number; name: string }[]
): string[] {
  return matches.map((item) => item.name);
}

function detect(subject: string, allowedIds = ALL_ALLOWED) {
  return detectCategoriesFromAllowed({
    subject,
    categories: CATALOG,
    allowedIds,
    defaultCategoryId: null,
    categoriesOrigin: ORIGIN,
    effectiveWpOrigin: ORIGIN,
  });
}

describe("V7.8.0 — attribution précise des catégories", () => {
  it("Test 1 — WordPress headless et IA : max 3, sans faux positifs", () => {
    const subject =
      "WordPress headless et intelligence artificielle : comment connecter un agent IA à un site découplé ?";
    const matches = detect(subject);
    const names = namesOf(matches);

    assert.ok(matches.length <= MAX_DYNAMIC_CATEGORIES);
    assert.ok(names.includes("WordPress headless"));
    assert.ok(names.includes("Agents IA"));
    assert.ok(names.includes("Intelligence artificielle"));
    assert.ok(!names.includes("WooCommerce"));
    assert.ok(!names.includes("IA prédictive"));
    assert.ok(!names.includes("Commerce headless"));
    assert.ok(!names.includes("Actualités IA"));
    assert.ok(!names.includes("Comprendre l'IA"));
    // Liste blanche ≠ attribution : on n'envoie pas les 14 autorisées.
    assert.ok(matches.length < ALL_ALLOWED.length);
  });

  it("Test 2 — WooCommerce : pas de headless ni IA prédictive", () => {
    const matches = detect(
      "Comment automatiser la gestion des commandes WooCommerce ?"
    );
    const names = namesOf(matches);

    assert.ok(names.includes("WooCommerce"));
    assert.ok(matches.length <= MAX_DYNAMIC_CATEGORIES);
    assert.ok(!names.includes("WordPress headless"));
    assert.ok(!names.includes("IA prédictive"));
    assert.ok(!names.includes("Agents IA"));
    // Automatisation peut apparaître selon le score, mais n'est pas obligatoire.
    if (names.includes("Outils & Automatisation")) {
      assert.ok(matches.length <= 2);
    }
  });

  it("Test 3 — Sécurité API WordPress", () => {
    const matches = detect(
      "Comment sécuriser l'API REST de WordPress ?"
    );
    const names = namesOf(matches);

    assert.ok(matches.length <= MAX_DYNAMIC_CATEGORIES);
    assert.ok(names.includes("WordPress"));
    assert.ok(
      names.includes("API et intégrations") || names.includes("Cybersécurité")
    );
    assert.ok(!names.includes("WooCommerce"));
    assert.ok(!names.includes("RAG"));
    assert.ok(!names.includes("IA prédictive"));
  });

  it("Test 4 — RAG sans WordPress / WooCommerce", () => {
    const matches = detect(
      "Mettre en place un RAG pour interroger la documentation d'une entreprise"
    );
    const names = namesOf(matches);

    assert.ok(names.includes("RAG"));
    assert.ok(matches.length <= MAX_DYNAMIC_CATEGORIES);
    assert.ok(!names.includes("WordPress"));
    assert.ok(!names.includes("WooCommerce"));
    assert.ok(!names.includes("WordPress headless"));
  });

  it("Test 5 — sujet sans correspondance → défaut ou vide", () => {
    const subject = "Organisation d'un séminaire RH interne au trimestre";

    const withDefault = detectCategoriesFromAllowed({
      subject,
      categories: CATALOG,
      allowedIds: ALL_ALLOWED,
      defaultCategoryId: 14,
      categoriesOrigin: ORIGIN,
      effectiveWpOrigin: ORIGIN,
    });
    assert.equal(withDefault.length, 1);
    assert.equal(withDefault[0]?.categoryId, 14);

    const withoutDefault = detectCategoriesFromAllowed({
      subject,
      categories: CATALOG,
      allowedIds: ALL_ALLOWED,
      defaultCategoryId: null,
      categoriesOrigin: ORIGIN,
      effectiveWpOrigin: ORIGIN,
    });
    assert.deepEqual(withoutDefault, []);
  });

  it("Test 6 — catégorie pertinente non autorisée jamais envoyée", () => {
    const matches = detect(
      "WordPress headless et intelligence artificielle : comment connecter un agent IA à un site découplé ?",
      [14, 116] // WordPress + WooCommerce seulement
    );
    const ids = matches.map((item) => item.categoryId);
    assert.ok(!ids.includes(140));
    assert.ok(!ids.includes(149));
    assert.ok(!ids.includes(138));
    assert.ok(ids.every((id) => id === 14 || id === 116));
  });

  it("Test 7 — changement de WordPress : aucun ID du site A", () => {
    const filtered = filterCategoryIdsForCurrentSite({
      ids: [140, 149, 138],
      categories: CATALOG,
      categoriesOrigin: "https://site-a.example",
      effectiveWpOrigin: "https://site-b.example",
    });
    assert.deepEqual(filtered, []);

    const sanitized = sanitizeCategoryIdsForWordPress({
      ids: [140, 149, 138],
      allowedIds: ALL_ALLOWED,
      categories: CATALOG,
      categoriesOrigin: "https://site-a.example",
      effectiveWpOrigin: "https://site-b.example",
      dynamicMode: true,
    });
    assert.deepEqual(sanitized, []);
  });

  it("Test 8 — hors mode dynamique, CATEGORY_MAP Naxialis inchangé", () => {
    const subject =
      "WordPress headless et intelligence artificielle : comment connecter un agent IA à un site découplé ?";
    const legacy = detectCategories(subject);
    const resolved = resolveCategoriesForSubject({
      subject,
      isNaxialisLegacy: true,
      config: null,
      effectiveWpOrigin: ORIGIN,
    });
    assert.deepEqual(
      resolved.map((item) => item.categoryId),
      legacy.map((item) => item.categoryId)
    );
  });

  it("ne remplit pas artificiellement 3 catégories", () => {
    const matches = detect("Guide pratique WooCommerce pour débuter");
    assert.ok(matches.length >= 1);
    assert.ok(matches.length <= MAX_DYNAMIC_CATEGORIES);
    assert.equal(matches.filter((item) => item.name === "WooCommerce").length, 1);
    // Une seule forte correspondance suffit.
    assert.ok(matches.length <= 2);
  });

  it("sanitize plafonne et déduplique en mode dynamique", () => {
    const sanitized = sanitizeCategoryIdsForWordPress({
      ids: [140, 149, 138, 140, 200, 116],
      allowedIds: ALL_ALLOWED,
      categories: CATALOG,
      categoriesOrigin: ORIGIN,
      effectiveWpOrigin: ORIGIN,
      dynamicMode: true,
    });
    assert.equal(sanitized.length, MAX_DYNAMIC_CATEGORIES);
    assert.deepEqual(sanitized, [140, 149, 138]);
  });

  it("score : « IA prédictive » reste sous le seuil si seul « ia » matche", () => {
    const predictive = CATALOG.find((item) => item.id === 200)!;
    const { score } = scoreCategoryAgainstSubject({
      subject:
        "WordPress headless et intelligence artificielle : comment connecter un agent IA à un site découplé ?",
      category: predictive,
    });
    assert.ok(score < 40);
  });

  it("mode dynamique n’est pas fusionné avec CATEGORY_MAP", () => {
    const resolved = resolveCategoriesForSubject({
      subject: "Guide SEO technique pour PME",
      isNaxialisLegacy: true,
      config: {
        categories: CATALOG,
        allowedIds: [133],
        defaultCategoryId: null,
        syncedAt: new Date().toISOString(),
        origin: ORIGIN,
      },
      effectiveWpOrigin: ORIGIN,
    });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0]?.categoryId, 133);
    // Pas d’IDs CATEGORY_MAP hors whitelist (ex. WordPress 14).
    assert.ok(!resolved.some((item) => item.categoryId === 14));
  });

  it("ID autorisé absent du snapshot (catégorie WP supprimée) → jamais attribué", () => {
    const deletedId = 99999;
    const matches = detectCategoriesFromAllowed({
      subject:
        "WordPress headless et intelligence artificielle : comment connecter un agent IA à un site découplé ?",
      categories: CATALOG,
      allowedIds: [140, 149, 138, deletedId],
      defaultCategoryId: deletedId,
      categoriesOrigin: ORIGIN,
      effectiveWpOrigin: ORIGIN,
    });
    assert.ok(!matches.some((item) => item.categoryId === deletedId));

    const sanitized = sanitizeCategoryIdsForWordPress({
      ids: [140, deletedId, 149],
      allowedIds: [140, 149, 138, deletedId],
      categories: CATALOG,
      categoriesOrigin: ORIGIN,
      effectiveWpOrigin: ORIGIN,
      dynamicMode: true,
    });
    assert.ok(!sanitized.includes(deletedId));
    assert.deepEqual(sanitized, [140, 149]);
  });
});
