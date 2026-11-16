import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("V7.8.1 — page Login maquette", () => {
  const page = readFileSync(resolve("app/login/page.tsx"), "utf8");
  const form = readFileSync(resolve("app/login/login-form.tsx"), "utf8");
  const hero = readFileSync(resolve("app/login/login-hero.tsx"), "utf8");
  const css = readFileSync(resolve("app/login/login-page.css"), "utf8");
  const actions = readFileSync(resolve("app/login/actions.ts"), "utf8");
  const auth = readFileSync(resolve("auth.ts"), "utf8");

  it("branche la maquette deux colonnes sur /login", () => {
    assert.match(page, /login-page\.css/);
    assert.match(page, /LoginHero/);
    assert.match(page, /login-page/);
    assert.match(page, /className="layout"/);
    assert.match(page, /Bienvenue/);
    assert.match(page, /Espace privé/);
    assert.doesNotMatch(page, /flex min-h-screen items-center justify-center bg-slate-50/);
  });

  it("conserve Auth.js via loginAction / signIn credentials", () => {
    assert.match(actions, /signIn\("credentials"/);
    assert.match(actions, /redirectTo:\s*"\/dashboard"/);
    assert.match(form, /loginAction/);
    assert.match(form, /useActionState/);
    assert.match(auth, /Credentials/);
    assert.match(auth, /ADMIN_PASSWORD_HASH|readAdminPasswordHash/);
    assert.match(auth, /signIn:\s*"\/login"/);
  });

  it("expose afficher/masquer mot de passe et états d’erreur", () => {
    assert.match(form, /passwordVisible|Masquer|Afficher/);
    assert.match(form, /role="alert"/);
    assert.match(form, /Connexion…/);
    assert.match(form, /disabled=\{pending\}/);
  });

  it("inclut le hero vidéo et le responsive de la maquette", () => {
    assert.match(hero, /\/login\/background\.mp4/);
    assert.match(hero, /prefers-reduced-motion/);
    assert.match(css, /grid-template-columns:\s*55%\s*45%/);
    assert.match(css, /@media \(max-width:\s*850px\)/);
    assert.match(css, /\.hero \{\s*[\s\S]*display:\s*none/);
  });

  it("embarque l’asset vidéo public", () => {
    assert.equal(existsSync(resolve("public/login/background.mp4")), true);
  });

  it("ne code pas de domaine d’auth ni de secret client", () => {
    assert.doesNotMatch(page, /agent-client-01|ADMIN_PASSWORD|sk-/);
    assert.doesNotMatch(form, /agent-client-01|ADMIN_PASSWORD|sk-/);
    assert.doesNotMatch(actions, /agent\.naxialis\.com|agent-client-01/);
  });
});
