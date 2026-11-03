import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInternalLinkPlan } from "../lib/agent/internal-links";
import { createWordPressDraft } from "../lib/wordpress";
import { sanitizeInternalLinks } from "../lib/agent/internal-links";
import { env } from "../lib/env";

describe("internal links — inventaire live", () => {
  it("MCP : pas de hubs facturation / SaaS / Brevo", async () => {
    const plan = await buildInternalLinkPlan(
      "Sécurité MCP pour les agents IA et les outils API"
    );
    assert.ok(plan.catalogSize > 0);
    for (const item of plan.selected) {
      assert.doesNotMatch(item.url, /facturation|applications-saas|wordpress-brevo/i);
    }
    assert.ok(
      plan.selected.length === 0 ||
        plan.selected.some((item) =>
          /agent|mcp|secur|api|rag|openai|llm/i.test(item.url + item.title)
        )
    );
  });

  it("sujet hors corpus → zéro lien", async () => {
    const plan = await buildInternalLinkPlan(
      "Réglementation maritime des phares islandais en 1820"
    );
    assert.equal(plan.selected.length, 0);
  });
});

describe("internal links — brouillon WordPress (sanitized)", () => {
  it("crée un brouillon draft avec contenu déjà filtré", async () => {
    const plan = await buildInternalLinkPlan(
      "Sécurité MCP pour les agents IA"
    );
    const allowed = plan.selected.map((item) => item.url);
    const allowedHref =
      allowed[0] ?? "https://example.com/external-ok";
    const raw = `<p>Introduction MCP.</p><p>Pour approfondir, lisez <a href="${allowedHref}">ce guide</a> et ignorez <a href="https://naxialis.com/automatisation-facturation-pennylane">la facturation</a>.</p><p><a href="https://owasp.org">OWASP</a></p>`;
    const host = new URL(env.WP_URL).hostname;
    const sanitized = sanitizeInternalLinks(raw, allowed, host);

    assert.doesNotMatch(sanitized.content, /automatisation-facturation/);
    assert.match(sanitized.content, /OWASP/);

    const stamp = Date.now();
    const draft = await createWordPressDraft({
      title: `[TEST maillage] MCP ${stamp}`,
      content: sanitized.content,
      excerpt: "Brouillon de validation du maillage interne.",
      slug: `test-maillage-mcp-${stamp}`,
      meta_title: "Test maillage MCP Naxialis",
      meta_description:
        "Brouillon de test pour valider la sanitization des liens internes avant publication.",
      categoryIds: [],
    });

    assert.equal(draft.success, true);
    assert.equal(draft.status, "draft");
    assert.ok(draft.post_id > 0);
  });
});
