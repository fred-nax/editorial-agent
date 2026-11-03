import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { ANALYSIS_VERSION } from "../lib/ai-visibility/constants";
import { reclassifyEntities } from "../lib/ai-visibility/entities";
import {
  collapseNameFragments,
  extractEntityCandidates,
} from "../lib/ai-visibility/extract";
import {
  nameMatchesBounded,
  stripUrlsAndTracking,
  verifyNamePresence,
} from "../lib/ai-visibility/match-name";
import { computeCampaignMetrics } from "../lib/ai-visibility/metrics";

const brand = {
  name: "Naxialis",
  primaryDomain: "naxialis.com",
  aliases: ["Naxialis Agency"],
  domainAliases: [] as string[],
  knownCompetitors: [] as Array<{ name: string; domain?: string | null }>,
};

const subject = "Agents IA sur mesure pour PME";

const providerTable = `
| Entreprise | Positionnement |
|---|---|
| **IA Infinity** | Agents IA sur mesure |
| **Tensoria** | Assistants RAG |
| **GENIAL** | Conception d’agents |
| **LUXIA Agents** | Agents vocaux |
| **Quadia** | Workflows métier |
| **Revolve IA** | Agents CRM |
`;

describe("GEO 1.1.2 — matching borné", () => {
  it("sage ne correspond pas à usage ni message", () => {
    assert.equal(nameMatchesBounded("sage", "usage"), false);
    assert.equal(nameMatchesBounded("sage", "message"), false);
    assert.equal(nameMatchesBounded("sage", "le logiciel Sage"), true);
  });

  it("utm_source=openai ne crée pas de mention OpenAI", () => {
    const body =
      "Voir la source (https://exemple.com/faq?utm_source=openai))\n\nUn agent est utile.";
    const presence = verifyNamePresence({ name: "OpenAI", bodyText: body });
    assert.equal(presence.inBody, false);
    assert.equal(presence.present, false);
    assert.equal(presence.onlyInUrlNoise, true);

    const extracted = extractEntityCandidates({
      text: body,
      brand,
      campaignSubject: subject,
      historicalNames: [{ name: "OpenAI", source: "entity" }],
    });
    assert.ok(!extracted.entities.some((e) => /openai/i.test(e.name)));
  });

  it("stripUrls retire le tracking", () => {
    const cleaned = stripUrlsAndTracking(
      "texte https://x.com?utm_source=openai fin"
    );
    assert.doesNotMatch(cleaned, /openai/i);
  });
});

describe("GEO 1.1.2 — extraction stricte", () => {
  it("titres Markdown Comment / Support / Pertinent ne créent pas d’entités", () => {
    const text = `
## Comment choisir un cas d’usage
**Support** : agent de qualification.
**Pertinent pour une PME si :** vous avez du volume.
`;
    const extracted = extractEntityCandidates({
      text,
      brand,
      campaignSubject: subject,
    });
    const names = extracted.entities.map((e) => e.name.toLowerCase());
    assert.ok(!names.includes("comment"));
    assert.ok(!names.includes("support"));
    assert.ok(!names.includes("pertinent"));
  });

  it("CRM ERP ETI RAG ne sont pas des marques sans preuve", () => {
    const text =
      "Intégrez CRM/ERP pour les PME/ETI et un pipeline RAG documentaire.";
    const extracted = extractEntityCandidates({
      text,
      brand,
      campaignSubject: subject,
    });
    const names = extracted.entities.map((e) =>
      e.name.toLowerCase().replace(/\s+/g, "")
    );
    assert.ok(!names.includes("crm"));
    assert.ok(!names.includes("erp"));
    assert.ok(!names.includes("eti"));
    assert.ok(!names.includes("rag"));
  });

  it("IA Infinity sans doublon Infinity", () => {
    const extracted = extractEntityCandidates({
      text: providerTable,
      brand,
      campaignSubject: subject,
    });
    const names = extracted.entities.map((e) => e.name);
    assert.ok(names.some((n) => /ia infinity/i.test(n)));
    assert.ok(!names.some((n) => /^infinity$/i.test(n)));

    const collapsed = collapseNameFragments([
      {
        name: "IA Infinity",
        kind: "other",
        category: "unknown",
        mentionKind: "mention",
      },
      {
        name: "Infinity",
        kind: "other",
        category: "unknown",
        mentionKind: "mention",
      },
    ]);
    assert.equal(collapsed.length, 1);
    assert.match(collapsed[0]!.name, /IA Infinity/i);
  });

  it("Tensoria GENIAL Quadia Revolve AI conservés si présents", () => {
    const extracted = extractEntityCandidates({
      text: providerTable,
      brand,
      campaignSubject: subject,
    });
    const blob = extracted.entities.map((e) => e.name).join(" | ");
    assert.match(blob, /Tensoria/i);
    assert.match(blob, /GENIAL/i);
    assert.match(blob, /Quadia/i);
    assert.match(blob, /Revolve/i);
    assert.match(blob, /LUXIA/i);
  });

  it("correction manuelle prioritaire", () => {
    const out = reclassifyEntities(
      [
        {
          name: "Gemini",
          mentionKind: "mention",
          categoryManual: true,
          lockedCategory: "software_product",
        },
      ],
      brand,
      subject
    );
    assert.equal(out[0]?.category, "software_product");
  });

  it("métriques ne comptent pas les faux positifs absents", () => {
    const extracted = extractEntityCandidates({
      text: providerTable,
      brand,
      campaignSubject: subject,
    });
    assert.ok(!extracted.entities.some((e) => /support|comment|crm/i.test(e.name)));
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [
        { status: "completed", citations: [], entities: extracted.entities },
      ],
    });
    assert.ok(
      !metrics.entities.some((e) =>
        /^(Support|Comment|CRM|ERP|ETI|RAG)$/i.test(e.name)
      )
    );
  });

  it("réanalyse locale sans web search (contrat source)", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/ai-visibility/reanalyze.ts"),
      "utf8"
    );
    assert.doesNotMatch(source, /getVisibilityProvider/);
    assert.doesNotMatch(source, /provider\.ask/);
    assert.match(source, /isEligibleHistoricalCandidate/);
  });

  it("idempotence extraction (mêmes entités)", () => {
    const a = extractEntityCandidates({
      text: providerTable,
      brand,
      campaignSubject: subject,
    }).entities.map((e) => e.name).sort();
    const b = extractEntityCandidates({
      text: providerTable,
      brand,
      campaignSubject: subject,
    }).entities.map((e) => e.name).sort();
    assert.deepEqual(a, b);
  });

  it("verbes / titres FR et hostnames ne deviennent pas des entités", () => {
    const text = `
Analyser les usages. Répondre aux messages. Utilisez Support si besoin.
Contrôle et Décision métier. Voir aussi https://openai.com/docs.
`;
    const extracted = extractEntityCandidates({
      text,
      brand,
      campaignSubject: subject,
      historicalNames: [
        { name: "Analyser", source: "mention" },
        { name: "Répondre", source: "mention" },
        { name: "Contrôle", source: "mention" },
        { name: "openai.com", domain: "openai.com", source: "entity" },
        { name: "Support", source: "snapshot" },
      ],
    });
    const names = extracted.entities.map((e) => e.name.toLowerCase());
    assert.ok(!names.includes("analyser"));
    assert.ok(!names.includes("répondre"));
    assert.ok(!names.includes("contrôle"));
    assert.ok(!names.includes("openai.com"));
    assert.ok(!names.includes("support"));
  });

  it("historique distinctif avec preuve conservé ; bruit non réinjecté", () => {
    const text = `${providerTable}\nMicrosoft 365 et Hubspot sont cités.`;
    const extracted = extractEntityCandidates({
      text,
      brand,
      campaignSubject: subject,
      historicalNames: [
        {
          name: "Microsoft",
          domain: "microsoft.com",
          source: "mention",
        },
        { name: "Tâches", source: "mention" },
        { name: "Volumes", source: "snapshot" },
      ],
    });
    const names = extracted.entities.map((e) => e.name);
    assert.ok(names.some((n) => /microsoft/i.test(n)));
    assert.ok(!names.some((n) => /^t[aâ]ches$/i.test(n)));
    assert.ok(!names.some((n) => /^volumes$/i.test(n)));
  });

  it("version analysis courante ≥ geo-1.1.2", () => {
    assert.match(ANALYSIS_VERSION, /^geo-1\.1\.[2-9]$/);
  });
});
