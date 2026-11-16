import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeHtmlEntities } from "../lib/seo/normalize";
import {
  detectCategoriesFromAllowed,
  MAX_DYNAMIC_CATEGORIES,
  normalizeWordPressCategoryText,
  parseSyncedCategoriesJson,
  scoreCategoryAgainstSubject,
  type SyncedWpCategory,
} from "../lib/wordpress-categories";

describe("V7.8.0 — décodage entités HTML des catégories WP", () => {
  it("décode &amp;, &#038;, &#38; et &eacute;", () => {
    assert.equal(
      normalizeWordPressCategoryText("Outils &amp; Automatisation"),
      "Outils & Automatisation"
    );
    assert.equal(
      normalizeWordPressCategoryText("Conseils &#038; Astuces"),
      "Conseils & Astuces"
    );
    assert.equal(
      normalizeWordPressCategoryText("A &#38; B"),
      "A & B"
    );
    assert.equal(
      normalizeWordPressCategoryText("S&eacute;curit&eacute;"),
      "Sécurité"
    );
  });

  it("laisse intact un texte sans entités", () => {
    assert.equal(
      normalizeWordPressCategoryText("WordPress headless"),
      "WordPress headless"
    );
  });

  it("ne casse pas les entités inconnues ou malformées", () => {
    assert.equal(
      normalizeWordPressCategoryText("Foo &unknown; Bar"),
      "Foo &unknown; Bar"
    );
    assert.equal(
      normalizeWordPressCategoryText("Foo &amp Bar"),
      "Foo &amp Bar"
    );
  });

  it("est idempotent (pas de double décodage destructif)", () => {
    const once = normalizeWordPressCategoryText(
      "Sécurité Cloud &amp; DevSecOps"
    );
    assert.equal(once, "Sécurité Cloud & DevSecOps");
    assert.equal(normalizeWordPressCategoryText(once), once);
    assert.equal(decodeHtmlEntities(once), once);
  });

  it("décode name/description dans parseSyncedCategoriesJson sans toucher id/slug", () => {
    const raw = JSON.stringify([
      {
        id: 139,
        name: "Outils &amp; Automatisation",
        slug: "outils-automatisation",
        count: 12,
        description: "S&eacute;curit&eacute; &#038; process",
      },
    ]);
    const parsed = parseSyncedCategoriesJson(raw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.id, 139);
    assert.equal(parsed[0]?.slug, "outils-automatisation");
    assert.equal(parsed[0]?.count, 12);
    assert.equal(parsed[0]?.name, "Outils & Automatisation");
    assert.equal(parsed[0]?.description, "Sécurité & process");
  });

  it("affiche correctement un snapshot déjà encodé (sans migration)", () => {
    const legacySnapshot = parseSyncedCategoriesJson(
      JSON.stringify([
        {
          id: 188,
          name: "Sécurité Cloud &amp; DevSecOps",
          slug: "securite-cloud-devsecops",
          count: 3,
          description: "",
        },
      ])
    );
    assert.equal(legacySnapshot[0]?.name, "Sécurité Cloud & DevSecOps");
  });

  it("n’altère pas le scoring dynamique ni la limite de 3", () => {
    const categories: SyncedWpCategory[] = [
      {
        id: 140,
        name: "WordPress headless",
        slug: "wordpress-headless",
        count: 1,
        description: "",
      },
      {
        id: 138,
        name: "Intelligence artificielle",
        slug: "intelligence-artificielle",
        count: 1,
        description: "",
      },
      {
        id: 149,
        name: "Agents IA",
        slug: "agents-ia",
        count: 1,
        description: "",
      },
      {
        id: 139,
        name: normalizeWordPressCategoryText("Outils &amp; Automatisation"),
        slug: "outils-automatisation",
        count: 1,
        description: "",
      },
      {
        id: 157,
        name: "IA prédictive",
        slug: "ia-predictive",
        count: 1,
        description: "",
      },
    ];

    const subject =
      "WordPress headless et intelligence artificielle : comment connecter un agent IA à un site découplé ?";

    const encodedScore = scoreCategoryAgainstSubject({
      subject,
      category: {
        id: 139,
        name: "Outils &amp; Automatisation",
        slug: "outils-automatisation",
        count: 1,
        description: "",
      },
    });
    const decodedScore = scoreCategoryAgainstSubject({
      subject,
      category: categories[3]!,
    });
    // Le nom encodé vs décodé ne doit pas favoriser une catégorie hors sujet.
    assert.ok(encodedScore.score < 40);
    assert.ok(decodedScore.score < 40);

    const selected = detectCategoriesFromAllowed({
      subject,
      categories,
      allowedIds: categories.map((item) => item.id),
      defaultCategoryId: null,
      categoriesOrigin: "https://naxialis.com",
      effectiveWpOrigin: "https://naxialis.com",
    });

    assert.ok(selected.length <= MAX_DYNAMIC_CATEGORIES);
    assert.deepEqual(
      selected.map((item) => item.categoryId).sort((a, b) => a - b),
      [138, 140, 149]
    );
    assert.ok(!selected.some((item) => item.categoryId === 139));
    assert.ok(!selected.some((item) => item.categoryId === 157));
  });
});
