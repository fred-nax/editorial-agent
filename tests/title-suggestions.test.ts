import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  formatEditorialGenerationMessage,
  parseEditorialContext,
  parseStoredEditorialContext,
} from "../lib/editorial-context";
import { buildGenerationMessage } from "../lib/topics/build-generation-context";
import { TITLE_SUGGESTION_MODEL } from "../lib/titles/config";
import { normalizeTitleSuggestions } from "../lib/titles/suggest";
import { approachLabel } from "../lib/titles/types";

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function fiveTitles() {
  return {
    suggestions: [
      { title: "Comment automatiser les tâches d'une PME avec un agent IA", approach: "guide" },
      { title: "Tutoriel : mettre en place un agent IA pour les tâches répétitives", approach: "tutoriel" },
      { title: "5 cas d'usage d'agents IA pour gagner du temps en PME", approach: "liste" },
      { title: "Agent IA ou automatisation classique : que choisir pour une PME ?", approach: "comparaison" },
      { title: "Pourquoi les agents IA changent la productivité des PME", approach: "analyse" },
    ],
  };
}

describe("V7.2 — suggestions de titres", () => {
  it("normalise cinq propositions valides", () => {
    const suggestions = normalizeTitleSuggestions(fiveTitles());
    assert.equal(suggestions.length, 5);
    assert.equal(approachLabel("liste"), "Liste pratique");
    assert.equal(TITLE_SUGGESTION_MODEL.includes("gpt"), true);
  });

  it("refuse une réponse invalide ou incomplète", () => {
    assert.throws(() => normalizeTitleSuggestions({ suggestions: [] }), /cinq/i);
    assert.throws(
      () =>
        normalizeTitleSuggestions({
          suggestions: fiveTitles().suggestions.map((item) => ({
            ...item,
            title: "court",
          })),
        }),
      /invalide/i
    );
    assert.throws(
      () =>
        normalizeTitleSuggestions({
          suggestions: [
            ...fiveTitles().suggestions.slice(0, 4),
            fiveTitles().suggestions[0],
          ],
        }),
      /double/i
    );
  });

  it("stocke le titre souhaité dans le contexte éditorial JSON", () => {
    const context = parseEditorialContext({
      preferredTitle: "  Un titre éditorial clair pour PME  ",
      language: "fr",
    });
    assert.equal(
      context?.preferredTitle,
      "Un titre éditorial clair pour PME"
    );
    assert.match(
      formatEditorialGenerationMessage("Sujet initial intact", context!),
      /Titre éditorial souhaité : Un titre éditorial clair pour PME\. Il s'agit d'une préférence/
    );
    assert.match(
      formatEditorialGenerationMessage("Sujet initial intact", context!),
      /^Sujet :\nSujet initial intact/
    );
  });

  it("respecte les langues fr, en-GB, en-US et es dans le contexte", () => {
    for (const code of ["fr", "en-GB", "en-US", "es"] as const) {
      const context = parseEditorialContext({
        preferredTitle: "A clear editorial title for SMEs now",
        language: code,
      });
      assert.equal(context?.language, code);
      assert.match(
        formatEditorialGenerationMessage("Subject", context!),
        /Titre éditorial souhaité/
      );
    }
  });

  it("sans titre sélectionné conserve le comportement historique", () => {
    assert.equal(buildGenerationMessage({ subject: "Sujet seul" }), "Sujet seul");
    assert.equal(parseEditorialContext({ preferredTitle: "   " }), null);
    assert.deepEqual(
      parseStoredEditorialContext({ angle: "Angle", audience: null }),
      parseEditorialContext({ angle: "Angle" })
    );
  });

  it("les anciennes générations sans preferredTitle restent lisibles", () => {
    const stored = parseStoredEditorialContext({
      angle: "Angle historique",
      language: "fr",
    });
    assert.equal(stored?.preferredTitle, null);
    assert.equal(stored?.angle, "Angle historique");
  });

  it("API et formulaire sont protégés sans appel au rendu", () => {
    const route = readSource("app/api/titles/suggest/route.ts");
    assert.match(route, /requireAuth/);
    assert.match(route, /suggestEditorialTitles/);
    assert.doesNotMatch(route, /create_wordpress_draft|runAgentSession/);

    const form = readSource("components/ArticleForm.tsx");
    assert.match(form, /Suggérer 5 titres/);
    assert.match(form, /Suggérer des titres/);
    assert.match(form, /Lightbulb/);
    assert.match(form, /preferredTitle/);
    assert.match(form, /TitleSuggestionsPicker/);
    assert.match(form, /openTitleSuggestionsDialog/);
    assert.match(form, /titlesDialogOpen/);
    assert.match(form, /Titre souhaité :/);
    assert.match(form, /onClick=\{\(\) => void requestTitleSuggestions\(\)\}/);
    assert.doesNotMatch(form, /useEffect\(\(\) => \{[\s\S]{0,80}requestTitleSuggestions/);

    const picker = readSource("components/TitleSuggestionsPicker.tsx");
    assert.match(picker, /Laisser l’agent choisir le titre/);
    assert.match(picker, /approachLabel/);

    const dialog = readSource("components/ui/dialog.tsx");
    assert.match(dialog, /@base-ui\/react\/dialog/);
    assert.match(dialog, /DialogContent/);

    const suggest = readSource("lib/titles/suggest.ts");
    assert.match(suggest, /assertLiveAllowed|npm_lifecycle_event === "test"/);
    assert.doesNotMatch(suggest, /beta\.agents|create_wordpress_draft/);
  });

  it("Dashboard embedded expose le Dialog sans allonger le flux historique", () => {
    const form = readSource("components/ArticleForm.tsx");
    assert.match(form, /layout\?\: "full" \| "embedded"/);
    assert.match(form, /openTitleSuggestionsDialog/);
    assert.match(form, /setTitlesDialogOpen\(false\)/);
    assert.match(form, /Modifier/);
    assert.match(
      form,
      /!titleSuggestions \|\| suggestionsStale[\s\S]{0,80}requestTitleSuggestions/
    );
    assert.doesNotMatch(form, /useEffect\(\(\) => \{[\s\S]{0,120}setTitlesDialogOpen\(true\)/);
  });

  it("ne modifie pas le moteur éditorial ni l’image V7.1", () => {
    assert.match(readSource("lib/agent/tools.ts"), /create_wordpress_draft/);
    assert.match(readSource("lib/wordpress.ts"), /status:\s*"draft"/);
    assert.match(readSource("lib/images/pipeline.ts"), /enqueueFeaturedImageAfterArticle|createPendingFeaturedImageRequest/);
    assert.match(
      readSource("lib/generation.ts"),
      /preferredTitle: storedEditorial\?\.preferredTitle/
    );
    assert.doesNotMatch(
      readSource("prisma/schema.prisma"),
      /preferredTitle/
    );
  });
});
