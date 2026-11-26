import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeEditorialHtml } from "../lib/cms/sanitize-editorial-html";

describe("V7.16.1 CMS-005 — sanitizeEditorialHtml", () => {
  it("supprime script, handlers et javascript:", () => {
    const raw = `
      <h2 class="text-xl">Titre</h2>
      <p onclick="alert(1)">Hello <script>alert(2)</script></p>
      <a href="javascript:alert(3)">bad</a>
      <img src="javascript:alert(4)" alt="x" />
      <iframe src="https://evil.test"></iframe>
    `;
    const { html } = sanitizeEditorialHtml(raw);
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /onclick/i);
    assert.doesNotMatch(html, /javascript:/i);
    assert.doesNotMatch(html, /<iframe/i);
    assert.match(html, /<h2 class="text-xl">Titre<\/h2>/);
    assert.match(html, /Hello/);
  });

  it("conserve tableaux Tailwind et FAQ details/summary", () => {
    const raw = `
      <table class="w-full border-collapse">
        <thead><tr><th class="text-left">A</th><th>B</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody>
      </table>
      <details class="mt-4"><summary>Question ?</summary><p>Réponse</p></details>
      <ul><li>Item</li></ul>
      <a href="https://naxialis.com/page" class="underline">Lien</a>
    `;
    const { html } = sanitizeEditorialHtml(raw);
    assert.match(html, /<table class="w-full border-collapse">/);
    assert.match(html, /<details class="mt-4">/);
    assert.match(html, /<summary>Question \?<\/summary>/);
    assert.match(html, /<ul>/);
    assert.match(html, /href="https:\/\/naxialis.com\/page"/);
  });

  it("est idempotent sur HTML déjà sain", () => {
    const raw = `<p class="mb-4">Texte <strong>fort</strong></p>`;
    const once = sanitizeEditorialHtml(raw).html;
    const twice = sanitizeEditorialHtml(once).html;
    assert.equal(once, twice);
  });
});
