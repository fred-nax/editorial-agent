import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENT_DECIDES_VALUE,
  CUSTOM_OPTION_VALUE,
  LANGUAGE_OPTIONS,
  editorialContextFromTopic,
  formatEditorialGenerationMessage,
  formatLanguagePreference,
  hasEditorialContext,
  parseEditorialContext,
  parseStoredEditorialContext,
} from "../lib/editorial-context";
import { buildGenerationMessage } from "../lib/topics/build-generation-context";

describe("indications éditoriales", () => {
  it("ignore les champs vides et Laisser l'agent décider", () => {
    assert.equal(
      parseEditorialContext({
        angle: "  ",
        audience: AGENT_DECIDES_VALUE,
        objective: "",
        language: AGENT_DECIDES_VALUE,
        seoKeywords: ", ,",
        notes: null,
      }),
      null
    );
  });

  it("valide et normalise les indications", () => {
    const context = parseEditorialContext({
      angle: "  Cinq cas d'usage  ",
      audience: "Dirigeants de PME",
      objective: "Tutoriel pratique",
      language: "fr",
      seoKeywords: " agent IA , PME , ",
      notes: "Évoquer les coûts.",
    });
    assert.deepEqual(context, {
      angle: "Cinq cas d'usage",
      audience: "Dirigeants de PME",
      objective: "Tutoriel pratique",
      language: "fr",
      seoKeywords: "agent IA, PME",
      notes: "Évoquer les coûts.",
      preferredTitle: null,
      webflowCategoryItemId: null,
      webflowAuthorItemId: null,
    });
    assert.equal(hasEditorialContext(context), true);
  });

  it("accepte chaque langue et distingue en-GB / en-US", () => {
    for (const option of LANGUAGE_OPTIONS) {
      const context = parseEditorialContext({ language: option.code });
      assert.equal(context?.language, option.code);
      assert.match(
        formatLanguagePreference(option.code),
        new RegExp(`${option.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(${option.code}\\)`)
      );
    }
    const uk = parseEditorialContext({ language: "en-GB" });
    const us = parseEditorialContext({ language: "en-US" });
    assert.equal(uk?.language, "en-GB");
    assert.equal(us?.language, "en-US");
    assert.notEqual(uk?.language, us?.language);
    assert.match(
      formatEditorialGenerationMessage("Sujet test", uk!),
      /Langue souhaitée : Anglais britannique \(en-GB\)\./
    );
    assert.match(
      formatEditorialGenerationMessage("Sujet test", us!),
      /Langue souhaitée : Anglais américain \(en-US\)\./
    );
  });

  it("accepte un public et un objectif personnalisés", () => {
    const context = parseEditorialContext({
      audience: "Directeurs informatiques de PME industrielles",
      objective: "Sensibiliser aux risques de sécurité des agents IA",
    });
    assert.equal(
      context?.audience,
      "Directeurs informatiques de PME industrielles"
    );
    assert.equal(
      context?.objective,
      "Sensibiliser aux risques de sécurité des agents IA"
    );
  });

  it("refuse Autre sans texte et les jetons techniques", () => {
    assert.throws(
      () => parseEditorialContext({ audience: CUSTOM_OPTION_VALUE }),
      /personnalisé|incomplet/i
    );
    assert.throws(
      () => parseEditorialContext({ objective: CUSTOM_OPTION_VALUE }),
      /personnalisé|incomplet/i
    );
  });

  it("refuse une langue inconnue", () => {
    assert.throws(
      () => parseEditorialContext({ language: "de" }),
      /langue/i
    );
  });

  it("limite la longueur des champs", () => {
    assert.throws(
      () => parseEditorialContext({ angle: "a".repeat(501) }),
      /500/
    );
    assert.throws(
      () =>
        parseEditorialContext({
          audience: "a".repeat(151),
        }),
      /150/
    );
    assert.throws(
      () =>
        parseEditorialContext({
          objective: "a".repeat(201),
        }),
      /200/
    );
  });

  it("conserve le comportement historique sans indications", () => {
    const subject = "Comment automatiser une PME avec un agent IA ?";
    assert.equal(buildGenerationMessage({ subject }), subject);
    assert.equal(
      buildGenerationMessage({
        subject,
        language: null,
        audience: null,
        objective: null,
      }),
      subject
    );
  });

  it("construit le message dynamique avec langue et personnalisations", () => {
    const subject = "Comment automatiser une PME avec un agent IA ?";
    const message = formatEditorialGenerationMessage(subject, {
      angle: "Présenter cinq cas d'usage concrets.",
      audience: "Directeurs informatiques de PME industrielles",
      objective: "Sensibiliser aux risques de sécurité des agents IA",
      language: "en-GB",
      seoKeywords: "agent IA PME, automatisation entreprise",
      notes: "Évoquer les coûts et les limites.",
      preferredTitle: null,
    });
    assert.match(message, /^Sujet :\nComment automatiser/);
    assert.match(message, /Langue souhaitée : Anglais britannique \(en-GB\)\./);
    assert.match(message, /Public cible :\nDirecteurs informatiques/);
    assert.match(message, /Objectif :\nSensibiliser aux risques/);
    assert.match(message, /préférences éditoriales/);
    assert.doesNotMatch(message, /<<<DONNEES_DOCUMENTAIRES>>>/);
    assert.doesNotMatch(message, /__custom__/);
  });

  it("réutilise angle et notes d'un Topic sans public cible", () => {
    const context = editorialContextFromTopic({
      angle: "Angle file",
      notes: "Notes file",
    });
    assert.deepEqual(context, {
      angle: "Angle file",
      audience: null,
      objective: null,
      seoKeywords: null,
      notes: "Notes file",
      language: null,
      preferredTitle: null,
      webflowCategoryItemId: null,
      webflowAuthorItemId: null,
    });
  });

  it("sérialise et relit le contexte, y compris les anciennes générations", () => {
    assert.equal(parseStoredEditorialContext(null), null);
    assert.equal(parseStoredEditorialContext({ language: "de" }), null);
    assert.deepEqual(
      parseStoredEditorialContext({
        angle: "Angle",
        audience: "Grand public",
        objective: null,
        seoKeywords: null,
        notes: null,
      }),
      {
        angle: "Angle",
        audience: "Grand public",
        objective: null,
        seoKeywords: null,
        notes: null,
        language: null,
        preferredTitle: null,
        webflowCategoryItemId: null,
        webflowAuthorItemId: null,
      }
    );
    assert.deepEqual(
      parseStoredEditorialContext({
        angle: null,
        audience: "Public legacy libre",
        objective: "Objectif legacy libre",
        seoKeywords: null,
        notes: null,
        language: "es",
      }),
      {
        angle: null,
        audience: "Public legacy libre",
        objective: "Objectif legacy libre",
        seoKeywords: null,
        notes: null,
        language: "es",
        preferredTitle: null,
        webflowCategoryItemId: null,
        webflowAuthorItemId: null,
      }
    );
  });
});
