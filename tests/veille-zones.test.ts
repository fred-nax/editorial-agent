import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWebSearchToolConfig } from "../lib/veille/openai-watch";
import { buildVeillePrompt } from "../lib/veille/search";
import { VEILLE_COUNTRIES } from "../lib/veille/types";
import { validateVeilleQuery } from "../lib/veille/verify";

const NOW = new Date("2026-11-03T12:00:00.000Z");

describe("V7.6 — zones International et États-Unis", () => {
  it("expose les cinq pays historiques plus US et INT_EN", () => {
    const codes = VEILLE_COUNTRIES.map((item) => item.code);
    assert.deepEqual(codes, ["FR", "BE", "CH", "CA", "LU", "US", "INT_EN"]);
  });

  it("ne localise pas web_search pour International (anglais)", () => {
    const parsed = validateVeilleQuery({
      theme: "generative AI regulation",
      periodDays: 30,
      country: "INT_EN",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    const tool = buildWebSearchToolConfig(parsed.query);
    assert.equal(tool.type, "web_search");
    assert.equal(tool.search_context_size, "medium");
    assert.equal("user_location" in tool && tool.user_location != null, false);
  });

  it("localise web_search sur les États-Unis pour US", () => {
    const parsed = validateVeilleQuery({
      theme: "generative AI regulation",
      periodDays: 7,
      country: "US",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    const tool = buildWebSearchToolConfig(parsed.query);
    assert.deepEqual(tool.user_location, {
      type: "approximate",
      country: "US",
      timezone: "America/New_York",
    });
  });

  it("conserve la localisation ISO pour la France", () => {
    const parsed = validateVeilleQuery({
      theme: "agents IA",
      periodDays: 90,
      country: "FR",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    const tool = buildWebSearchToolConfig(parsed.query);
    assert.deepEqual(tool.user_location, {
      type: "approximate",
      country: "FR",
      timezone: "Europe/Paris",
    });
    const prompt = buildVeillePrompt(parsed.query, NOW);
    assert.match(prompt, /Pays visé : France/);
  });
});
