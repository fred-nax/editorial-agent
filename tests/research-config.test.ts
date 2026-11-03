import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultDomainQuotas, totalQuota } from "../lib/seo/domains";
import {
  defaultResearchConfiguration,
  validateResearchConfiguration,
} from "../lib/seo/research-config";

describe("Research configuration Phase 1.2", () => {
  it("defaults to domains mode with 5/4/4/4/3", () => {
    const config = defaultResearchConfiguration();
    assert.equal(config.mode, "domains");
    assert.equal(config.requestedCount, totalQuota(defaultDomainQuotas()));
  });

  it("validates a single-domain search", () => {
    const result = validateResearchConfiguration({
      mode: "domains",
      researchGoal: "seo",
      domains: [
        { domainId: "seo_geo", enabled: true, quota: 10 },
        { domainId: "ai_agents", enabled: false, quota: 0 },
        { domainId: "wordpress_woo", enabled: false, quota: 0 },
        { domainId: "saas_web", enabled: false, quota: 0 },
        { domainId: "automation_api", enabled: false, quota: 0 },
      ],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.requestedCount, 10);
      assert.equal(result.value.quotas.seo_geo, 10);
      assert.equal(result.value.quotas.ai_agents, 0);
    }
  });

  it("validates multi-domain quotas", () => {
    const result = validateResearchConfiguration({
      mode: "domains",
      researchGoal: "commercial",
      domains: [
        { domainId: "ai_agents", enabled: true, quota: 5 },
        { domainId: "saas_web", enabled: true, quota: 5 },
        { domainId: "seo_geo", enabled: true, quota: 10 },
        { domainId: "wordpress_woo", enabled: false, quota: 0 },
        { domainId: "automation_api", enabled: false, quota: 0 },
      ],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.requestedCount, 20);
      assert.equal(result.value.researchGoal, "commercial");
    }
  });

  it("validates a free topic search", () => {
    const result = validateResearchConfiguration({
      mode: "free",
      researchGoal: "problems",
      customTopic: "Cybersécurité des PME",
      requestedCount: 10,
      researchInstructions:
        "Identifier les problèmes concrets rencontrés par les PME françaises.",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.mode, "free");
      assert.equal(result.value.customTopic, "Cybersécurité des PME");
      assert.equal(result.value.requestedCount, 10);
    }
  });

  it("validates trends and commercial goals", () => {
    for (const researchGoal of ["trends", "commercial"] as const) {
      const result = validateResearchConfiguration({
        mode: "free",
        researchGoal,
        customTopic: "Impression 3D",
        requestedCount: 5,
      });
      assert.equal(result.ok, true);
    }
  });

  it("rejects free topic without subject", () => {
    const result = validateResearchConfiguration({
      mode: "free",
      researchGoal: "seo",
      customTopic: "  ",
      requestedCount: 5,
    });
    assert.equal(result.ok, false);
  });

  it("rejects invalid request counts", () => {
    const result = validateResearchConfiguration({
      mode: "free",
      researchGoal: "seo",
      customTopic: "Robotique",
      requestedCount: 7,
    });
    assert.equal(result.ok, false);
  });

  it("rejects empty domain selection", () => {
    const result = validateResearchConfiguration({
      mode: "domains",
      researchGoal: "seo",
      domains: [
        { domainId: "ai_agents", enabled: false, quota: 0 },
        { domainId: "wordpress_woo", enabled: false, quota: 0 },
        { domainId: "seo_geo", enabled: false, quota: 0 },
        { domainId: "saas_web", enabled: false, quota: 0 },
        { domainId: "automation_api", enabled: false, quota: 0 },
      ],
    });
    assert.equal(result.ok, false);
  });

  it("rejects unknown domain ids", () => {
    const result = validateResearchConfiguration({
      mode: "domains",
      researchGoal: "seo",
      domains: [{ domainId: "unknown", enabled: true, quota: 3 }],
    });
    assert.equal(result.ok, false);
  });
});

describe("API auth surface Phase 1.2", () => {
  it("protects research config and custom theme routes", async () => {
    const fs = await import("node:fs/promises");
    const paths = [
      "app/api/research-configs/route.ts",
      "app/api/research-configs/[id]/route.ts",
      "app/api/custom-themes/route.ts",
      "app/api/custom-themes/[id]/route.ts",
      "app/api/opportunities/route.ts",
    ];
    for (const file of paths) {
      const source = await fs.readFile(file, "utf8");
      assert.match(source, /requireAuth/);
      assert.match(source, /Unauthorized/);
    }
  });

  it("does not call create_wordpress_draft from opportunity search", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("lib/seo/opportunity-search.ts", "utf8");
    assert.doesNotMatch(source, /import\s+.*createWordPressDraft/);
    assert.doesNotMatch(source, /createWordPressDraft\s*\(/);
    assert.doesNotMatch(source, /process\.env\.OPENAI_AGENT_ID/);
    assert.match(source, /web_search/);
  });
});
