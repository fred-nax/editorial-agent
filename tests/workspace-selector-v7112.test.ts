import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  assertRequestWorkspaceMatchesActive,
  isWebflowModuleEnabled,
  WORKSPACE_COOKIE_NAME,
  WORKSPACE_IDS,
  WORKSPACE_REQUEST_HEADER,
  WorkspaceContextError,
  webflowEmptyState,
} from "../lib/workspace";
import {
  WORKSPACE_BROADCAST_CHANNEL,
  WORKSPACE_SWITCH_STORAGE_KEY,
} from "../lib/workspace/client-constants";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("V7.11.2 — sélecteur global et isolation UI", () => {
  it("expose le cookie sécurisé et le header de binding d’écriture", () => {
    assert.equal(WORKSPACE_COOKIE_NAME, "naxialis_workspace");
    assert.equal(WORKSPACE_REQUEST_HEADER, "x-naxialis-workspace-id");
    assert.equal(WORKSPACE_BROADCAST_CHANNEL, "naxialis-workspace-switch");
    assert.ok(WORKSPACE_SWITCH_STORAGE_KEY.includes("v7112"));
  });

  it("autorise veille et inventaire Webflow ; refuse opportunités / images", () => {
    assert.equal(isWebflowModuleEnabled("veille"), true);
    assert.equal(isWebflowModuleEnabled("topics"), true);
    assert.equal(isWebflowModuleEnabled("inventory"), true);
    assert.equal(isWebflowModuleEnabled("opportunities"), false);
    assert.equal(isWebflowModuleEnabled("featured_image"), false);
    assert.equal(isWebflowModuleEnabled("analytics"), false);
    assert.match(webflowEmptyState("opportunities").reason, /inventaire/i);
    assert.match(webflowEmptyState("analytics").reason, /WordPress/i);
  });

  it("refuse un header workspace incohérent avec l’espace cookie", () => {
    const active = {
      id: WORKSPACE_IDS.wordpress,
      slug: "wordpress-naxialis",
      name: "WordPress",
      cmsProvider: "wordpress" as const,
      siteUrl: "https://naxialis.com",
      siteLabel: "naxialis.com",
      defaultLanguage: "fr",
      enabled: true,
    };
    const ok = new Request("http://localhost/api/generate", {
      headers: { [WORKSPACE_REQUEST_HEADER]: WORKSPACE_IDS.wordpress },
    });
    assert.doesNotThrow(() =>
      assertRequestWorkspaceMatchesActive(ok, active)
    );

    const absent = new Request("http://localhost/api/generate");
    assert.doesNotThrow(() =>
      assertRequestWorkspaceMatchesActive(absent, active)
    );

    const bad = new Request("http://localhost/api/generate", {
      headers: { [WORKSPACE_REQUEST_HEADER]: WORKSPACE_IDS.webflow },
    });
    assert.throws(
      () => assertRequestWorkspaceMatchesActive(bad, active),
      (error: unknown) =>
        error instanceof WorkspaceContextError &&
        error.code === "WORKSPACE_MISMATCH" &&
        error.status === 409
    );
  });

  it("sidebar et mobile embarquent le sélecteur sous le logo", () => {
    const sidebar = read("components/Sidebar.tsx");
    assert.match(sidebar, /WorkspaceSelector/);
    assert.match(sidebar, /Content Agent/);
    const mobile = read("components/MobileNav.tsx");
    assert.match(mobile, /WorkspaceSelector/);
    const layout = read("app/(protected)/layout.tsx");
    assert.match(layout, /WorkspaceProvider/);
    assert.match(layout, /listEnabledWorkspaces/);
    assert.match(layout, /resolveActiveWorkspace/);
  });

  it("provider multi-onglets + epoch + POST /api/workspace", () => {
    const provider = read("components/workspace/WorkspaceProvider.tsx");
    assert.match(provider, /BroadcastChannel/);
    assert.match(provider, /WORKSPACE_SWITCH_STORAGE_KEY/);
    assert.match(provider, /router\.replace\("\/dashboard"\)/);
    assert.match(provider, /router\.refresh/);
    assert.match(provider, /WORKSPACE_REQUEST_HEADER/);
    assert.match(provider, /AbortError/);
    const selector = read("components/workspace/WorkspaceSelector.tsx");
    assert.match(selector, /Espace éditorial/);
    assert.match(selector, /switchWorkspace/);
    assert.match(selector, /providerLabel\(workspace\.cmsProvider\)/);
    assert.match(selector, /siteCaption\(workspace\)/);
    // Pas de répétition name + provider sur la même ligne principale.
    assert.doesNotMatch(selector, /\{active\.name\}/);
    const sidebar = read("components/Sidebar.tsx");
    // Cause régression V7.11.2 : relative ne doit pas écraser fixed.
    assert.match(sidebar, /fixed inset-y-0 left-0 z-40/);
    assert.doesNotMatch(sidebar, /lg:flex relative|relative.*lg:flex/);
  });

  it("dashboard sans agrégats croisés WP/Webflow", () => {
    const dash = read("app/(protected)/dashboard/page.tsx");
    assert.doesNotMatch(dash, /draftsWordpressThisMonth|draftsWebflowThisMonth/);
    assert.match(dash, /workspaceWhere/);
    assert.match(dash, /DashboardWelcome/);
    assert.match(dash, /cmsProvider === "wordpress"/);
  });

  it("nouvel article : indicateur d’espace, pas de picker CMS", () => {
    const page = read("app/(protected)/articles/new/page.tsx");
    assert.match(page, /resolveActiveWorkspace/);
    assert.match(page, /workspace=\{workspace\}/);
    const form = read("components/ArticleForm.tsx");
    assert.match(form, /ActiveWorkspaceIndicator/);
    assert.doesNotMatch(form, /CmsDestinationPicker/);
    assert.match(form, /workspaceFetch/);
    assert.match(form, /workspaceEpoch/);
    assert.match(form, /resolveDefaultLanguage/);
  });

  it("historique : filtre CMS retiré, badges conservés", () => {
    const page = read("app/(protected)/articles/page.tsx");
    assert.doesNotMatch(page, /ArticleHistoryFilters|parseHistoryCmsFilter/);
    assert.match(page, /workspaceWhere/);
    const history = read("components/ArticleHistory.tsx");
    assert.match(history, /CmsDestinationBadge/);
  });

  it("génération fige le workspace initial + binding écriture", () => {
    const generation = read("lib/generation.ts");
    assert.match(generation, /workspaceId de l'enregistrement, jamais le cookie/);
    const route = read("app/api/generate/route.ts");
    assert.match(route, /assertRequestWorkspaceMatchesActive/);
    assert.match(route, /assertGenerationWorkspaceConsistency/);
  });

  it("opportunités Webflow empty state ; veille isolée activée", () => {
    const opp = read("app/(protected)/opportunities/page.tsx");
    assert.match(opp, /WorkspaceEmptyState/);
    assert.match(opp, /opportunities/);
    const veille = read("app/(protected)/veille/page.tsx");
    assert.match(veille, /assertModuleAllowedForWorkspace/);
    assert.match(veille, /EditorialWatch/);
    const corpus = read("lib/veille/editorial-corpus.ts");
    assert.match(corpus, /includeWordPressInventory/);
    assert.match(corpus, /cmsProvider === "wordpress"/);
    assert.doesNotMatch(corpus, /WORKSPACE_IDS\.wordpress/);
    const historyDb = read("lib/veille/history-db.ts");
    assert.match(historyDb, /workspaceId obligatoire/);
    assert.doesNotMatch(historyDb, /WORKSPACE_IDS\.wordpress/);
  });

  it("analytics Webflow empty ; intégrations dual sections + dual-read", () => {
    const analytics = read("app/(protected)/analytics/page.tsx");
    assert.match(analytics, /webflowEmptyState\("analytics"\)/);
    assert.match(analytics, /cmsProvider === "webflow"/);
    const integrations = read("app/(protected)/settings/integrations/page.tsx");
    assert.match(integrations, /loadWorkspaceCmsSettings/);
    assert.match(integrations, /workspaceSummaries/);
    const panel = read("components/cms/CmsIntegrationsPanel.tsx");
    assert.match(panel, /workspaceSummaries/);
    assert.match(panel, /deux espaces/);
  });

  it("cookie invalide : layout rebascule WordPress", () => {
    const layout = read("app/(protected)/layout.tsx");
    assert.match(layout, /WORKSPACE_NOT_FOUND/);
    assert.match(layout, /buildWorkspaceCookieOptions/);
    assert.match(layout, /WORKSPACE_IDS\.wordpress/);
  });
});
