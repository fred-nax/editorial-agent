import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, before, after } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  WORKSPACE_COOKIE_NAME,
  WORKSPACE_IDS,
  assertSameWorkspace,
  getWorkspaceByIdOrSlug,
  resolveActiveWorkspaceIdFromCookie,
  workspaceWhere,
  WorkspaceContextError,
} from "../lib/workspace";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL requis pour les tests d’isolation RSC (utiliser la base migtest)."
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

describe("V7.11.1 — isolation RSC / accès hors espace", () => {
  it("pages détail et file utilisent la couche workspace", () => {
    const detail = read("app/(protected)/articles/[id]/page.tsx");
    assert.match(detail, /requireGenerationInActiveWorkspace/);
    assert.match(detail, /loadGenerationMetaInActiveWorkspace/);
    assert.match(detail, /revalidate = 0/);
    assert.doesNotMatch(
      detail,
      /findUnique\(\{\s*where:\s*\{\s*id\s*\}\s*\}\)/
    );

    const metaBlock = detail.slice(
      detail.indexOf("generateMetadata"),
      detail.indexOf("export default")
    );
    assert.match(metaBlock, /Génération introuvable/);
    assert.match(metaBlock, /loadGenerationMetaInActiveWorkspace/);

    const neu = read("app/(protected)/articles/new/page.tsx");
    assert.match(neu, /loadTopicInActiveWorkspace/);

    const topics = read("app/(protected)/topics/page.tsx");
    assert.match(topics, /workspaceWhere\(workspace\.id\)/);
    assert.match(topics, /assertModuleAllowedForWorkspace/);

    const history = read("app/(protected)/articles/page.tsx");
    assert.match(history, /listArticleHistory/);
    assert.match(history, /workspaceId:\s*workspace\.id/);
    assert.match(
      read("lib/articles/history-query.ts"),
      /workspaceWhere\(input\.workspaceId\)/
    );

    const analytics = read("app/(protected)/analytics/page.tsx");
    assert.match(analytics, /webflowEmptyState\("analytics"\)/);
    assert.match(analytics, /resolveActiveWorkspace/);
  });

  it("API articles + images + opportunités + thèmes isolés", () => {
    assert.match(
      read("app/api/articles/[id]/route.ts"),
      /assertSameWorkspace|resolveActiveWorkspace/
    );
    assert.match(
      read("app/api/articles/[id]/route.ts"),
      /workspaceId:\s*workspace\.id/
    );
    assert.match(
      read("app/api/opportunities/[id]/route.ts"),
      /workspaceWhere|resolveActiveWorkspace/
    );
    assert.match(
      read("app/api/custom-themes/[id]/route.ts"),
      /workspaceWhere|resolveActiveWorkspace/
    );
    assert.match(
      read("lib/images/service.ts"),
      /workspaceId !== undefined && generation\.workspaceId !== workspaceId/
    );
    assert.match(
      read("app/api/veille/searches/route.ts"),
      /prismaWatchHistoryStore\(workspace\.id\)/
    );
  });

  it("cookie invalide refusée ; cookie absent → WordPress (transitoire)", async () => {
    const absent = await resolveActiveWorkspaceIdFromCookie(null);
    assert.equal(absent.workspaceId, WORKSPACE_IDS.wordpress);
    assert.equal(absent.fromCookie, false);

    await assert.rejects(
      () =>
        resolveActiveWorkspaceIdFromCookie(
          `${WORKSPACE_COOKIE_NAME}=workspace-inexistant`
        ),
      (error: unknown) =>
        error instanceof WorkspaceContextError &&
        error.code === "WORKSPACE_NOT_FOUND"
    );

    const wp = await getWorkspaceByIdOrSlug(WORKSPACE_IDS.wordpress);
    assert.ok(wp);
    assert.equal(wp.cmsProvider, "wordpress");
    const wf = await getWorkspaceByIdOrSlug(WORKSPACE_IDS.webflow);
    assert.ok(wf);
    assert.equal(wf.cmsProvider, "webflow");
  });

  it("assertSameWorkspace refuse les accès croisés", () => {
    assert.doesNotThrow(() =>
      assertSameWorkspace(WORKSPACE_IDS.wordpress, WORKSPACE_IDS.wordpress)
    );
    assert.throws(
      () =>
        assertSameWorkspace(
          WORKSPACE_IDS.wordpress,
          WORKSPACE_IDS.webflow,
          "Génération"
        ),
      (error: unknown) =>
        error instanceof WorkspaceContextError && error.status === 404
    );
  });
});

describe("V7.11.1 — accès générations croisés (DB migtest)", () => {
  const db = createDb();
  const ids = {
    wp: "rsc_iso_gen_wp",
    wf: "rsc_iso_gen_wf",
  };

  before(async () => {
    await db.articleGeneration.deleteMany({
      where: { id: { in: [ids.wp, ids.wf] } },
    });
    await db.articleGeneration.createMany({
      data: [
        {
          id: ids.wp,
          workspaceId: WORKSPACE_IDS.wordpress,
          subject: "RSC iso WordPress",
          status: "completed",
          cmsDestination: "wordpress",
        },
        {
          id: ids.wf,
          workspaceId: WORKSPACE_IDS.webflow,
          subject: "RSC iso Webflow SECRET",
          title: "Titre Webflow secret",
          status: "completed",
          cmsDestination: "webflow",
        },
      ],
    });
  });

  after(async () => {
    await db.articleGeneration.deleteMany({
      where: { id: { in: [ids.wp, ids.wf] } },
    });
    await db.$disconnect();
  });

  it("WordPress → génération WordPress autorisé ; Webflow refusé", async () => {
    const allowed = await db.articleGeneration.findFirst({
      where: { id: ids.wp, ...workspaceWhere(WORKSPACE_IDS.wordpress) },
    });
    assert.ok(allowed);
    assert.equal(allowed.subject, "RSC iso WordPress");

    const denied = await db.articleGeneration.findFirst({
      where: { id: ids.wf, ...workspaceWhere(WORKSPACE_IDS.wordpress) },
    });
    assert.equal(denied, null);
  });

  it("Webflow → génération Webflow autorisé ; WordPress refusé", async () => {
    const allowed = await db.articleGeneration.findFirst({
      where: { id: ids.wf, ...workspaceWhere(WORKSPACE_IDS.webflow) },
    });
    assert.ok(allowed);
    assert.equal(allowed.cmsDestination, "webflow");

    const denied = await db.articleGeneration.findFirst({
      where: { id: ids.wp, ...workspaceWhere(WORKSPACE_IDS.webflow) },
    });
    assert.equal(denied, null);
  });

  it("URL directe hors espace : findFirst scoped = aucune donnée (pas de titre leak)", async () => {
    const meta = await db.articleGeneration.findFirst({
      where: { id: ids.wf, ...workspaceWhere(WORKSPACE_IDS.wordpress) },
      select: { title: true, subject: true },
    });
    assert.equal(meta, null);
  });

  it("update/delete croisés = 0 ligne", async () => {
    const updated = await db.articleGeneration.updateMany({
      where: { id: ids.wp, workspaceId: WORKSPACE_IDS.webflow },
      data: { subject: "HACK" },
    });
    assert.equal(updated.count, 0);

    const deleted = await db.articleGeneration.deleteMany({
      where: { id: ids.wf, workspaceId: WORKSPACE_IDS.wordpress },
    });
    assert.equal(deleted.count, 0);

    const still = await db.articleGeneration.findUnique({ where: { id: ids.wf } });
    assert.ok(still);
    assert.equal(still.subject, "RSC iso Webflow SECRET");
  });
});
