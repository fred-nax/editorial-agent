/**
 * V7.13.2 — Persistance références WordPress sur migtest (client Prisma réel).
 * Aucun appel OpenAI / WordPress distant.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WORKSPACE_IDS } from "../lib/workspace/constants";
import {
  validateWordPressReferenceSelection,
  WordPressReferenceValidationError,
} from "../lib/wordpress/references-validate";

const PREFIX = "v7132_wp_";

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL requis — utiliser naxialis_agent_v7113_migtest uniquement."
    );
  }
  if (!url.includes("v7113_migtest") && !url.includes("migtest")) {
    throw new Error(
      `Refus d’écrire hors base de test (URL=${url.replace(/:[^:@/]+@/, ":***@")}).`
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

describe("V7.13.2 — intégration Prisma migtest (WordPress refs)", () => {
  const db = createDb();
  const workspaceId = WORKSPACE_IDS.wordpress;
  const siteOrigin = "https://example-v7132.test";
  const ids = {
    cat1: `${PREFIX}cat1`,
    cat2: `${PREFIX}cat2`,
    catMissing: `${PREFIX}cat_missing`,
    authorApi: `${PREFIX}author_api`,
    authorOther: `${PREFIX}author_other`,
    topic: `${PREFIX}topic`,
  };

  before(async () => {
    await db.topic.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await db.wordPressCmsReference.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });

    await db.wordPressCmsReference.createMany({
      data: [
        {
          id: ids.cat1,
          workspaceId,
          kind: "category",
          siteOrigin,
          wpId: 101,
          name: "Parent",
          slug: "parent",
          parentWpId: null,
          missingAt: null,
        },
        {
          id: ids.cat2,
          workspaceId,
          kind: "category",
          siteOrigin,
          wpId: 102,
          name: "Enfant",
          slug: "enfant",
          parentWpId: 101,
          missingAt: null,
        },
        {
          id: ids.catMissing,
          workspaceId,
          kind: "category",
          siteOrigin,
          wpId: 199,
          name: "Disparue",
          slug: "gone",
          missingAt: new Date(),
        },
        {
          id: ids.authorApi,
          workspaceId,
          kind: "author",
          siteOrigin,
          wpId: 7,
          name: "API Writer",
          slug: "api-writer",
          missingAt: null,
        },
        {
          id: ids.authorOther,
          workspaceId,
          kind: "author",
          siteOrigin,
          wpId: 8,
          name: "Other Author",
          slug: "other",
          missingAt: null,
        },
      ],
    });
  });

  after(async () => {
    await db.topic.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await db.wordPressCmsReference.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.$disconnect();
  });

  it("valide sélection manuelle multi-catégories", async () => {
    const validated = await validateWordPressReferenceSelection({
      workspaceId,
      siteOrigin,
      mode: "manual",
      categoryIds: [101, 102],
      authorId: null,
      authorCapability: "self_only",
      apiUserId: 7,
      allowEmptyManualCategories: true,
    });
    assert.equal(validated.mode, "manual");
    assert.deepEqual(validated.categoryIds, [101, 102]);
    assert.equal(validated.injectAuthor, false);
  });

  it("refuse catégorie manquante / autre workspace logic via missingAt", async () => {
    await assert.rejects(
      () =>
        validateWordPressReferenceSelection({
          workspaceId,
          siteOrigin,
          mode: "manual",
          categoryIds: [199],
          allowEmptyManualCategories: true,
        }),
      (err: unknown) =>
        err instanceof WordPressReferenceValidationError &&
        err.code === "CATEGORY_MISSING"
    );
  });

  it("refuse auteur tiers si capability self_only", async () => {
    await assert.rejects(
      () =>
        validateWordPressReferenceSelection({
          workspaceId,
          siteOrigin,
          mode: "automatic",
          categoryIds: [],
          authorId: 8,
          authorCapability: "self_only",
          apiUserId: 7,
        }),
      (err: unknown) =>
        err instanceof WordPressReferenceValidationError &&
        err.code === "AUTHOR_FORBIDDEN"
    );
  });

  it("n’injecte pas author pour le compte API", async () => {
    const validated = await validateWordPressReferenceSelection({
      workspaceId,
      siteOrigin,
      mode: "automatic",
      authorId: 7,
      authorCapability: "can_assign",
      apiUserId: 7,
    });
    assert.equal(validated.injectAuthor, false);
    assert.equal(validated.authorId, null);
  });

  it("injecte author si can_assign et auteur distinct", async () => {
    const validated = await validateWordPressReferenceSelection({
      workspaceId,
      siteOrigin,
      mode: "automatic",
      authorId: 8,
      authorCapability: "can_assign",
      apiUserId: 7,
    });
    assert.equal(validated.injectAuthor, true);
    assert.equal(validated.authorId, 8);
  });

  it("persiste Topic wp fields sans toucher Webflow", async () => {
    await db.topic.create({
      data: {
        id: ids.topic,
        workspaceId,
        subject: `${PREFIX} subject`,
        status: "pending",
        wpCategorizationMode: "manual",
        wpCategoryIds: JSON.stringify([101, 102]),
        wpAuthorId: 7,
        webflowCategoryItemId: null,
        webflowAuthorItemId: null,
      },
    });
    const topic = await db.topic.findUniqueOrThrow({ where: { id: ids.topic } });
    assert.equal(topic.wpCategorizationMode, "manual");
    assert.equal(topic.wpCategoryIds, "[101,102]");
    assert.equal(topic.wpAuthorId, 7);
    assert.equal(topic.webflowCategoryItemId, null);
  });

  it("accepte sélection manuelle vide", async () => {
    const validated = await validateWordPressReferenceSelection({
      workspaceId,
      siteOrigin,
      mode: "manual",
      categoryIds: [],
      allowEmptyManualCategories: true,
    });
    assert.deepEqual(validated.categoryIds, []);
  });
});
