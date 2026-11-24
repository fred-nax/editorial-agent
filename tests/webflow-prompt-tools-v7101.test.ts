import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { buildArticlePrompt } from "../lib/agent/prompt";
import {
  getAgentToolsForDestination,
  getEditorialAgentProfile,
} from "../lib/agent/registry";
import { CREATE_WORDPRESS_DRAFT_TOOL_NAME } from "../lib/agent/tools";
import {
  CREATE_WEBFLOW_DRAFT_TOOL_NAME,
  createWebflowDraftToolDefinition,
} from "../lib/agent/webflow-draft-tool";
import {
  failedStepLabel,
  preserveProgressStageOnFailure,
  resolveFailedDisplayStage,
  timelineStepState,
} from "../lib/progress";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function toolNames(destination: "wordpress" | "webflow"): string[] {
  return getAgentToolsForDestination(destination).map((tool) =>
    tool.type === "function" ? tool.name : tool.type
  );
}

describe("V7.10.1 — prompt CMS + outils session + progression", () => {
  it("prompt WordPress historique inchangé (create_wordpress_draft)", () => {
    const prompt = buildArticlePrompt("Sujet WP");
    assert.match(prompt, /create_wordpress_draft/);
    assert.match(prompt, /Slim SEO/);
    assert.match(prompt, /extrait WordPress/);
    assert.doesNotMatch(prompt, /create_webflow_draft/);
    assert.doesNotMatch(prompt, /Destination CMS : Webflow/);

    // Signature à 4 args wordpress = même exigence outil.
    const explicit = buildArticlePrompt("Sujet WP", null, undefined, "wordpress");
    assert.match(explicit, /appeler obligatoirement create_wordpress_draft/);
  });

  it("prompt Webflow exige create_webflow_draft et exclut WordPress", () => {
    const prompt = buildArticlePrompt("Sujet WF", null, undefined, "webflow");
    assert.match(prompt, /create_webflow_draft/);
    assert.match(prompt, /Destination CMS : Webflow/);
    assert.match(prompt, /appeler obligatoirement l’outil create_webflow_draft/);
    assert.match(prompt, /ne te contente pas de rédiger/);
    // Interdiction explicite OK ; aucune obligation d’appeler l’outil WP.
    assert.match(prompt, /ne jamais appeler create_wordpress_draft/);
    assert.doesNotMatch(prompt, /appeler obligatoirement create_wordpress_draft/);
    assert.doesNotMatch(prompt, /Slim SEO/);
    assert.doesNotMatch(prompt, /extrait WordPress/);
    assert.match(prompt, /ne jamais utiliser d’inventaire WordPress/);
  });

  it("outils transmis par destination : Webflow = web_search + create_webflow_draft", () => {
    assert.deepEqual(toolNames("webflow"), [
      "web_search",
      CREATE_WEBFLOW_DRAFT_TOOL_NAME,
    ]);
    assert.deepEqual(toolNames("wordpress"), [
      "web_search",
      CREATE_WORDPRESS_DRAFT_TOOL_NAME,
    ]);

    const profile = getEditorialAgentProfile("webflow");
    assert.ok(profile.allowedToolNames.includes(CREATE_WEBFLOW_DRAFT_TOOL_NAME));
    assert.ok(
      !profile.allowedToolNames.includes(CREATE_WORDPRESS_DRAFT_TOOL_NAME)
    );

    assert.equal(
      createWebflowDraftToolDefinition.name,
      CREATE_WEBFLOW_DRAFT_TOOL_NAME
    );
    assert.equal(createWebflowDraftToolDefinition.type, "function");
    assert.match(
      createWebflowDraftToolDefinition.description,
      /Obligatoire|brouillon/i
    );
  });

  it("run-session passe cmsDestination au prompt et journalise les outils", () => {
    const run = read("lib/agent/run-session.ts");
    assert.match(run, /buildArticlePrompt\(/);
    assert.match(run, /identity,\s*\r?\n\s*cmsDestination/);
    assert.match(run, /Outils session/);
    assert.match(run, /sessionToolNames/);
    // Diagnostic uniquement — jamais de création automatique depuis le texte.
    assert.match(run, /lastAssistantTextPreview/);
    assert.match(run, /non utilisé pour créer un brouillon/);
  });

  it("échec conserve l’étape métier (écriture) au lieu de Préparation", () => {
    assert.equal(preserveProgressStageOnFailure("writing"), "writing");
    assert.equal(preserveProgressStageOnFailure("researching"), "researching");
    assert.equal(preserveProgressStageOnFailure("failed"), "writing");
    assert.equal(preserveProgressStageOnFailure(null), "writing");

    assert.equal(
      resolveFailedDisplayStage("failed", "writing"),
      "writing"
    );
    assert.equal(
      resolveFailedDisplayStage("failed", "failed"),
      "writing"
    );
    assert.match(failedStepLabel("writing"), /Rédaction/);
    assert.match(failedStepLabel("failed"), /Rédaction/);

    assert.equal(
      timelineStepState("preparing", "failed", "writing"),
      "complete"
    );
    assert.equal(
      timelineStepState("researching", "failed", "writing"),
      "complete"
    );
    assert.equal(
      timelineStepState("writing", "failed", "writing"),
      "failed"
    );
    assert.equal(
      timelineStepState("creating_webflow", "failed", "writing"),
      "upcoming"
    );

    const generation = read("lib/generation.ts");
    assert.match(generation, /preserveProgressStageOnFailure/);
    assert.doesNotMatch(
      generation,
      /progressStage:\s*"failed"/
    );
  });
});
