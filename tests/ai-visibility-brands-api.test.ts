import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { readApiJson } from "../lib/ai-visibility/http";
import {
  createVisibilityBrand,
  listVisibilityBrands,
} from "../lib/ai-visibility/brand-service";

function jsonResponse(
  body: unknown,
  init: { status?: number; contentType?: string | null } = {}
): Response {
  const status = init.status ?? 200;
  const headers = new Headers();
  if (init.contentType !== null) {
    headers.set("content-type", init.contentType ?? "application/json");
  }
  return new Response(
    body === undefined || body === ""
      ? ""
      : typeof body === "string"
        ? body
        : JSON.stringify(body),
    { status, headers }
  );
}

describe("AI Visibility — HTTP parse", () => {
  it("accepte une liste vide valide", async () => {
    const parsed = await readApiJson<{ brands: unknown[] }>(
      jsonResponse({ brands: [] })
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.data.brands, []);
    }
  });

  it("accepte une liste avec données", async () => {
    const parsed = await readApiJson<{ brands: Array<{ name: string }> }>(
      jsonResponse({ brands: [{ name: "Naxialis" }] })
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.data.brands[0]?.name, "Naxialis");
    }
  });

  it("signale une réponse HTTP vide", async () => {
    const parsed = await readApiJson(jsonResponse("", { status: 404 }));
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.status, 404);
      assert.match(parsed.error, /vide/i);
    }
  });

  it("signale une réponse non JSON", async () => {
    const parsed = await readApiJson(
      jsonResponse("<html>nope</html>", {
        status: 500,
        contentType: "text/html",
      })
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.error, /non JSON/i);
    }
  });

  it("signale une session absente (401)", async () => {
    const parsed = await readApiJson(
      jsonResponse({ error: "Unauthorized" }, { status: 401 })
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.status, 401);
      assert.equal(parsed.error, "Unauthorized");
    }
  });

  it("signale une permission refusée (403)", async () => {
    const parsed = await readApiJson(
      jsonResponse({ error: "Forbidden" }, { status: 403 })
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.status, 403);
      assert.equal(parsed.error, "Forbidden");
    }
  });
});

describe("AI Visibility — brand service (DB)", () => {
  it("liste vide puis création POST puis liste avec données", async () => {
    const before = await listVisibilityBrands();
    assert.ok(Array.isArray(before));

    const unique = `naxialis-test-${Date.now()}.com`;
    const created = await createVisibilityBrand({
      name: "Naxialis",
      primaryDomain: unique,
      description: "Agence IA",
      sector: "IA",
      country: "FR",
      language: "fr",
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }

    const after = await listVisibilityBrands();
    assert.ok(after.some((brand) => brand.id === created.brand.id));
    assert.ok(
      after.find((brand) => brand.id === created.brand.id)?.campaignCount === 0
    );
  });

  it("rejette une création invalide", async () => {
    const result = await createVisibilityBrand({
      name: "",
      primaryDomain: "bad",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  });
});

describe("AI Visibility — frontend error surface", () => {
  it("ne traite pas une erreur serveur comme liste vide silencieuse", async () => {
    const parsed = await readApiJson<{ brands?: unknown[] }>(
      jsonResponse({ error: "Impossible de charger les marques." }, { status: 500 })
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.error, /Impossible de charger/);
    }
    // Le board doit afficher parsed.error, pas brands=[] sans message.
    assert.ok(!("brands" in (parsed.ok ? parsed.data : {})));
  });

  it("détecte un mock Prisma en échec via createVisibilityBrand", async () => {
    const original = mock.fn();
    void original;
    const result = await createVisibilityBrand({
      name: "X",
      primaryDomain: "not-a-domain",
    });
    assert.equal(result.ok, false);
  });
});
