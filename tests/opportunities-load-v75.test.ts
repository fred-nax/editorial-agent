import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { parseResponseJson } from "../lib/http/parse-response-json";

describe("V7.5 — chargement opportunités (non-régression)", () => {
  it("le client Prisma détecte le catalogue V7.5 (sortOrder / themeId)", async () => {
    const source = await readFile("lib/db.ts", "utf8");
    assert.match(source, /PRISMA_CLIENT_TOKEN/);
    assert.match(source, /wordpress-content-type-v7-6-1c/);
    assert.match(source, /seoThemeCatalogV75Ready/);
    assert.match(source, /googleIntegrationsReady/);
    assert.match(source, /wordpressContentTypeReady/);
    assert.match(source, /GscPropertyDailyStat/);
    assert.match(source, /sortOrder/);
    assert.match(source, /legacyKey/);
    assert.match(source, /themeId/);
    assert.match(source, /GoogleConnection/);
  });

  it("GET /api/opportunities renvoie toujours du JSON en cas d’erreur", async () => {
    const source = await readFile("app/api/opportunities/route.ts", "utf8");
    assert.match(source, /Chargement des opportunités impossible/);
    assert.match(source, /status: 500/);
    assert.match(source, /listThemeCatalog/);
    assert.match(source, /JSON\.stringify\(payload\)/);
  });

  it("GET /api/opportunities pagine avec skip/take et compteurs globaux", async () => {
    const source = await readFile("app/api/opportunities/route.ts", "utf8");
    assert.match(source, /ALLOWED_PAGE_SIZES/);
    assert.match(source, /skip/);
    assert.match(source, /take:\s*pageSize/);
    assert.match(source, /summaryCounts/);
    assert.match(source, /pageCount/);
    assert.doesNotMatch(source, /take:\s*150/);

    const board = await readFile("components/OpportunitiesBoard.tsx", "utf8");
    assert.match(board, /pageSize/);
    assert.match(board, /Par page/);
    assert.match(board, /Précédent/);
    assert.match(board, /Suivant/);
    assert.match(board, /Page \{page\} sur \{pageCount\}/);
  });

  it("listThemeCatalog ordonne par sortOrder (nécessite client Prisma à jour)", async () => {
    const source = await readFile("lib/seo/theme-catalog.ts", "utf8");
    assert.match(source, /sortOrder:\s*"asc"/);
  });

  it("parseResponseJson refuse les corps vides sans exposer l’erreur native", async () => {
    const empty = new Response("", { status: 500 });
    await assert.rejects(
      () => parseResponseJson(empty, "Impossible de charger les opportunités"),
      /réponse vide/
    );

    const invalid = new Response("<html>error</html>", { status: 500 });
    await assert.rejects(
      () => parseResponseJson(invalid, "Impossible de charger les opportunités"),
      /non JSON/
    );

    const ok = new Response(
      JSON.stringify({
        opportunities: [{ id: "1", themeId: null }],
        customThemes: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    const payload = await parseResponseJson<{
      opportunities: Array<{ themeId: null }>;
    }>(ok, "Impossible de charger les opportunités");
    assert.equal(payload.opportunities.length, 1);
    assert.equal(payload.opportunities[0]?.themeId, null);
  });

  it("parseResponseJson propage le message d’erreur API", async () => {
    const response = new Response(
      JSON.stringify({
        error: "Chargement des opportunités impossible : Unknown argument `sortOrder`",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
    await assert.rejects(
      () => parseResponseJson(response, "Impossible de charger les opportunités"),
      /Unknown argument `sortOrder`/
    );
  });

  it("le board utilise parseResponseJson et un bouton Réessayer", async () => {
    const board = await readFile("components/OpportunitiesBoard.tsx", "utf8");
    assert.match(board, /parseResponseJson/);
    assert.match(board, /Réessayer/);
    assert.doesNotMatch(
      board,
      /await response\.json\(\)\) as ListPayload/
    );
  });

  it("conserve la compatibilité des opportunités sans themeId", async () => {
    const schema = await readFile("prisma/schema.prisma", "utf8");
    assert.match(schema, /themeId\s+String\?/);
    assert.match(schema, /theme\s+String/);
  });
});
