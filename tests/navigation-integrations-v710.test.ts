import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  isNavActive,
  navigation,
  sectionTitle,
} from "../components/navigation";

const root = process.cwd();

describe("Navigation — entrée Intégrations", () => {
  it("expose Intégrations sous Paramètres avec icône Plug", () => {
    const settingsIndex = navigation.findIndex(
      (item) => item.href === "/settings"
    );
    const integrationsIndex = navigation.findIndex(
      (item) => item.href === "/settings/integrations"
    );
    assert.ok(settingsIndex >= 0);
    assert.ok(integrationsIndex >= 0);
    assert.equal(integrationsIndex, settingsIndex + 1);
    assert.equal(navigation[integrationsIndex].label, "Intégrations");
    assert.equal(navigation[integrationsIndex].icon.displayName, "Plug");

    const source = readFileSync(
      path.join(root, "components/navigation.ts"),
      "utf8"
    );
    assert.match(source, /\bPlug\b/);
    assert.match(source, /\/settings\/integrations/);
  });

  it("état actif distinct Paramètres vs Intégrations", () => {
    assert.equal(isNavActive("/settings", "/settings"), true);
    assert.equal(isNavActive("/settings/integrations", "/settings"), false);
    assert.equal(
      isNavActive("/settings/integrations", "/settings/integrations"),
      true
    );
    assert.equal(isNavActive("/settings", "/settings/integrations"), false);
    assert.equal(sectionTitle("/settings/integrations"), "Intégrations");
  });

  it("page /settings/integrations toujours présente", () => {
    const page = readFileSync(
      path.join(root, "app/(protected)/settings/integrations/page.tsx"),
      "utf8"
    );
    assert.match(page, /CmsIntegrationsPanel/);
    assert.match(page, /listCmsDestinations/);
    assert.match(page, /listPublicEditorialAgentStatuses/);
  });
});
