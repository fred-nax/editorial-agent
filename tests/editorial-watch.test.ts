import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  assertLiveWatchAllowed,
  buildVeillePrompt,
  handleVeilleSearch,
  runEditorialWatch,
  type VeilleSearchClient,
} from "../lib/veille/search";
import { sortByVerifiedDate, validateVeilleQuery } from "../lib/veille/verify";
import type { VeilleArticle, VeilleQuery } from "../lib/veille/types";

const NOW = new Date("2026-11-03T12:00:00.000Z");

const QUERY: VeilleQuery = {
  theme: "agents IA pour les PME",
  periodDays: 30,
  country: "FR",
};

function article(overrides: Record<string, unknown> = {}) {
  return {
    title: "Une PME déploie un agent IA",
    url: "https://www.lesechos.fr/tech/ia/agent-pme",
    source: "Les Echos",
    date: null,
    summary: "Une entreprise décrit le déploiement d’un agent interne.",
    event: "Lancement d’un agent interne",
    ...overrides,
  };
}

function responseOf(
  items: unknown,
  refs: Array<{ url: string; date?: string | null }>
) {
  return {
    output_text: JSON.stringify(items),
    output: [
      {
        type: "web_search_call",
        action: {
          type: "search",
          sources: refs.map((ref) => ({
            type: "url",
            url: ref.url,
            ...(ref.date ? { date: ref.date } : {}),
          })),
        },
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(items),
            annotations: refs.map((ref) => ({
              type: "url_citation",
              url: ref.url,
              title: "Source",
            })),
          },
        ],
      },
    ],
  };
}

function clientReturning(payload: unknown, calls: unknown[] = []): VeilleSearchClient {
  return {
    async search(input, query) {
      calls.push({ input, query });
      if (payload instanceof Error) {
        throw payload;
      }
      return payload;
    },
  };
}

describe("veille éditoriale", () => {
  it("accepte une thématique et les périodes 7, 30 et 90", () => {
    for (const periodDays of [7, 30, 90] as const) {
      const parsed = validateVeilleQuery({
        theme: "  cybersécurité   des PME  ",
        periodDays,
        country: "FR",
      });
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.query.theme, "cybersécurité des PME");
        assert.equal(parsed.query.periodDays, periodDays);
        const prompt = buildVeillePrompt(parsed.query, NOW);
        assert.match(prompt, new RegExp(`${periodDays} jours`));
        assert.match(prompt, /cybersécurité des PME/);
        assert.match(prompt, /N’invente aucune URL/);
      }
    }
  });

  it("refuse une période, un pays ou une thématique invalides", () => {
    assert.equal(validateVeilleQuery({ theme: "ia", periodDays: 14, country: "FR" }).ok, false);
    assert.equal(validateVeilleQuery({ theme: "agents IA", periodDays: 30, country: "US" }).ok, false);
    assert.equal(validateVeilleQuery({ theme: "  ", periodDays: 30, country: "FR" }).ok, false);
  });

  it("retrouve une publication dont l’URL est citée par la recherche", async () => {
    const result = await runEditorialWatch(
      QUERY,
      clientReturning(
        responseOf([article()], [{ url: "https://lesechos.fr/tech/ia/agent-pme" }])
      ),
      NOW
    );
    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0]?.sourceName, "Les Echos");
    assert.equal(result.articles[0]?.url, "https://lesechos.fr/tech/ia/agent-pme");
    assert.equal(result.articles[0]?.dateVerified, false);
    assert.equal(result.articles[0]?.publishedOn, null);
    assert.equal(result.articles[0]?.event, "Lancement d’un agent interne");
    assert.match(result.notice, /pas une mesure de popularité/);
  });

  it("retourne une liste vide quand la recherche ne propose rien", async () => {
    const result = await runEditorialWatch(
      QUERY,
      clientReturning(responseOf([], [{ url: "https://exemple.fr/a" }])),
      NOW
    );
    assert.deepEqual(result.articles, []);
    assert.equal(result.incomplete, false);
  });

  it("signale une réponse incomplète sans inventer de source", async () => {
    const result = await runEditorialWatch(
      QUERY,
      clientReturning({
        output_text: "",
        output: [
          {
            type: "web_search_call",
            action: { type: "search", sources: [{ type: "url", url: "https://exemple.fr/a" }] },
          },
        ],
      }),
      NOW
    );
    assert.deepEqual(result.articles, []);
    assert.equal(result.incomplete, true);
  });

  it("déduplique les URL et écarte celles absentes des références", async () => {
    const result = await runEditorialWatch(
      QUERY,
      clientReturning(
        responseOf(
          [
            article(),
            article({ title: "Doublon", summary: "Même adresse avec un paramètre de tracking." }),
            article({
              title: "Source inventée",
              url: "https://invente.example/article",
              summary: "Cette URL n’a pas été renvoyée par la recherche.",
            }),
          ],
          [{ url: "https://lesechos.fr/tech/ia/agent-pme?utm_source=openai" }]
        )
      ),
      NOW
    );
    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0]?.title, "Une PME déploie un agent IA");
    assert.equal(result.discarded, 2);
  });

  it("ne vérifie une date que si la référence de recherche la porte", async () => {
    const result = await runEditorialWatch(
      QUERY,
      clientReturning(
        responseOf(
          [
            article({
              url: "https://lemonde.fr/pixels/2026/11/01/agent",
              date: "2026-11-01",
              title: "Date seulement affirmée par le modèle",
            }),
            article({
              url: "https://usine-digitale.fr/agent-verifie",
              date: "2026-10-20",
              title: "Date portée par la source",
              source: "L’Usine Digitale",
            }),
          ],
          [
            { url: "https://lemonde.fr/pixels/2026/11/01/agent" },
            { url: "https://usine-digitale.fr/agent-verifie", date: "2026-10-20" },
          ]
        )
      ),
      NOW
    );
    const claimed = result.articles.find((item) => item.sourceName === "Les Echos");
    const verified = result.articles.find((item) => item.sourceName === "L’Usine Digitale");
    assert.equal(claimed?.dateVerified, false);
    assert.equal(claimed?.publishedOn, null);
    assert.equal(verified?.dateVerified, true);
    assert.equal(verified?.publishedOn, "2026-10-20");
    assert.equal(result.articles[0]?.url, "https://lemonde.fr/pixels/2026/11/01/agent");
    assert.equal(
      sortByVerifiedDate(result.articles)[0]?.url,
      "https://usine-digitale.fr/agent-verifie"
    );
  });

  it("écarte un article ancien, y compris via la date du chemin d’URL", async () => {
    const result = await runEditorialWatch(
      { ...QUERY, periodDays: 7 },
      clientReturning(
        responseOf(
          [
            article({
              url: "https://archive.example/2020/01/15/vieux-papier",
              date: null,
              title: "Article ancien",
            }),
            article({
              url: "https://recent.example/breve",
              date: "2020-05-01",
              title: "Date ancienne affirmée",
            }),
            article({
              url: "https://frais.example/note",
              date: null,
              title: "Publication récente non datée",
            }),
          ],
          [
            { url: "https://archive.example/2020/01/15/vieux-papier" },
            { url: "https://recent.example/breve" },
            { url: "https://frais.example/note" },
          ]
        )
      ),
      NOW
    );
    assert.deepEqual(
      result.articles.map((item) => item.url),
      ["https://frais.example/note"]
    );
  });

  it("applique le seuil de 7, 30 et 90 jours à une date de référence", async () => {
    const payload = responseOf(
      [
        article({
          url: "https://media.example/dossier",
          date: "2026-09-01",
          title: "Dossier de septembre",
        }),
      ],
      [{ url: "https://media.example/dossier", date: "2026-09-01" }]
    );
    const week = await runEditorialWatch(
      { ...QUERY, periodDays: 7 },
      clientReturning(payload),
      NOW
    );
    const month = await runEditorialWatch(
      { ...QUERY, periodDays: 30 },
      clientReturning(payload),
      NOW
    );
    const quarter = await runEditorialWatch(
      { ...QUERY, periodDays: 90 },
      clientReturning(payload),
      NOW
    );
    assert.equal(week.articles.length, 0);
    assert.equal(month.articles.length, 0);
    assert.equal(quarter.articles.length, 1);
    assert.equal(quarter.articles[0]?.dateVerified, true);
  });

  it("trie par date vérifiée sans attribuer de date aux autres", () => {
    const articles: VeilleArticle[] = [
      {
        title: "Sans date",
        sourceName: "A",
        url: "https://a.example/1",
        summary: "Résumé A",
        event: null,
        kind: "unknown",
        publishedOn: null,
        dateVerified: false,
      },
      {
        title: "Plus ancienne vérifiée",
        sourceName: "B",
        url: "https://b.example/1",
        summary: "Résumé B",
        event: null,
        kind: "unknown",
        publishedOn: "2026-10-01",
        dateVerified: true,
      },
      {
        title: "Plus récente vérifiée",
        sourceName: "C",
        url: "https://c.example/1",
        summary: "Résumé C",
        event: null,
        kind: "unknown",
        publishedOn: "2026-11-02",
        dateVerified: true,
      },
    ];
    assert.deepEqual(
      sortByVerifiedDate(articles).map((item) => item.title),
      ["Plus récente vérifiée", "Plus ancienne vérifiée", "Sans date"]
    );
  });

  it("masque une erreur OpenAI sans exposer de secret", async () => {
    const error = Object.assign(new Error("invalid key sk-proj-secret-value"), {
      status: 401,
      code: "expired_secret_key",
    });
    const calls: unknown[] = [];
    const result = await handleVeilleSearch(
      new Request("http://local/api/veille/search", {
        method: "POST",
        body: JSON.stringify(QUERY),
      }),
      { authenticated: true, client: clientReturning(error, calls), now: NOW }
    );
    assert.equal(result.status, 502);
    assert.match(result.body.error ?? "", /expiré/);
    assert.doesNotMatch(result.body.error ?? "", /sk-proj/);
    assert.equal(calls.length, 1);
  });

  it("refuse une recherche non authentifiée sans appeler OpenAI", async () => {
    const calls: unknown[] = [];
    const result = await handleVeilleSearch(
      new Request("http://local/api/veille/search", {
        method: "POST",
        body: JSON.stringify(QUERY),
      }),
      {
        authenticated: false,
        client: clientReturning(responseOf([article()], []), calls),
        now: NOW,
      }
    );
    assert.equal(result.status, 401);
    assert.equal(calls.length, 0);
  });

  it("bloque l’appel OpenAI réel pendant les tests", () => {
    assert.equal(process.env.npm_lifecycle_event, "test");
    assert.throws(() => assertLiveWatchAllowed(), /ne contactent pas OpenAI/);
    const live = readFileSync(resolve("lib/veille/openai-watch.ts"), "utf8");
    assert.match(live, /assertLiveWatchAllowed\(\)/);
    assert.match(live, /import\("@\/lib\/openai"\)/);
  });

  it("garde la veille hors de l’agent, du SEO et de WordPress", () => {
    const root = resolve(".");
    const read = (path: string) => readFileSync(resolve(root, path), "utf8");
    const watch = [
      read("lib/veille/search.ts"),
      read("lib/veille/verify.ts"),
      read("lib/veille/classify.ts"),
      read("lib/veille/publication-date.ts"),
      read("lib/veille/topic-proposal.ts"),
      read("lib/veille/openai-watch.ts"),
      read("app/api/veille/search/route.ts"),
      read("components/EditorialWatch.tsx"),
      read("components/VeilleSuggestionDialog.tsx"),
      read("lib/veille/suggestions.ts"),
      read("lib/veille/openai-suggestions.ts"),
      read("app/api/veille/suggestions/route.ts"),
    ].join("\n");
    const screen = read("components/EditorialWatch.tsx");
    const dialog = read("components/VeilleSuggestionDialog.tsx");
    assert.match(screen, /Rechercher les actualités/);
    assert.match(screen, /Date non vérifiée/);
    assert.match(screen, /Aucun article WordPress/);
    assert.match(screen, /Suggérer 3 sujets SEO/);
    assert.match(screen, /Proposer un sujet/);
    assert.match(screen, /buildTopicProposal\(article, result\.theme\)/);
    assert.match(screen, /subject: choice\.title/);
    assert.doesNotMatch(screen, /Disponible à la prochaine étape/);
    assert.equal(screen.match(/fetch\(/g)?.length ?? 0, 1);
    assert.equal(dialog.match(/fetch\(/g)?.length ?? 0, 2);
    assert.match(dialog, /\/api\/veille\/suggestions/);
    assert.match(dialog, /\/api\/topics\/check-duplicates/);
    assert.doesNotMatch(read("lib/veille/openai-suggestions.ts"), /web_search|runAgentSession/);
    assert.match(read("lib/veille/search.ts"), /étude ou rapport/);
    assert.match(read("app/api/veille/search/route.ts"), /requireAuth/);
    assert.match(read("lib/veille/openai-watch.ts"), /web_search/);
    assert.match(read("lib/veille/openai-watch.ts"), /web_search_call\.action\.sources/);
    assert.doesNotMatch(watch, /from ["'][^"']*(prisma|wordpress|run-session)/i);
    assert.doesNotMatch(watch, /runAgentSession|create_wordpress_draft/);
    assert.doesNotMatch(read("lib/seo/opportunity-search.ts"), /veille/);
    assert.doesNotMatch(read("lib/agent/run-session.ts"), /veille/);
    assert.match(read("prisma/schema.prisma"), /model EditorialWatchSearch/);
    assert.doesNotMatch(read("prisma/schema.prisma"), /model Veille\b/);
  });
});
