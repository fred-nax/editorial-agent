import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AGENT_ID =
  "agent_8f198ad500864e0d8eaa402a69cd58e02d38e41a7ce24165ad";

const WP_URL = process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

/**
 * Sujet passé depuis PowerShell
 */
const subject = process.argv.slice(2).join(" ").trim();

if (!subject) {
  console.error("Sujet manquant.");
  console.error(
    'Exemple : node index.mjs "Comment connecter WooCommerce à Pennylane"'
  );
  process.exit(1);
}

/**
 * Catégories WordPress
 */
const CATEGORY_MAP = [
  {
    categoryId: 116,
    name: "WooCommerce",
    keywords: [
      "woocommerce",
      "boutique",
      "e-commerce",
      "ecommerce",
      "commande",
      "paiement",
      "panier",
    ],
  },
  {
    categoryId: 150,
    name: "Facturation électronique",
    keywords: [
      "facturation électronique",
      "facture électronique",
      "facture",
      "facturation",
      "pennylane",
      "tiime",
    ],
  },
  {
    categoryId: 139,
    name: "Outils & Automatisation",
    keywords: [
      "make",
      "automatisation",
      "automatiser",
      "workflow",
      "zapier",
      "processus",
    ],
  },
  {
    categoryId: 155,
    name: "N8N",
    keywords: ["n8n"],
  },
  {
    categoryId: 138,
    name: "Intelligence artificielle",
    keywords: [
      "intelligence artificielle",
      "ia",
      "llm",
      "chatbot",
      "openai",
      "claude",
      "gemini",
      "copilot",
    ],
  },
  {
    categoryId: 149,
    name: "Agents IA",
    keywords: [
      "agent ia",
      "agents ia",
      "agent ai",
      "ai agent",
      "agent intelligent",
    ],
  },
  {
    categoryId: 147,
    name: "RAG",
    keywords: [
      "rag",
      "retrieval augmented generation",
      "base vectorielle",
      "vector database",
      "pgvector",
    ],
  },
  {
    categoryId: 148,
    name: "Recherche sémantique",
    keywords: [
      "recherche sémantique",
      "semantic search",
      "embedding",
      "embeddings",
    ],
  },
  {
    categoryId: 133,
    name: "SEO / GEO",
    keywords: [
      "seo",
      "geo",
      "référencement",
      "referencement",
      "google",
      "search console",
      "schema",
      "données structurées",
      "donnees structurees",
    ],
  },
  {
    categoryId: 140,
    name: "WordPress headless",
    keywords: [
      "wordpress headless",
      "headless wordpress",
      "next.js wordpress",
      "nextjs wordpress",
      "wpgraphql",
    ],
  },
  {
    categoryId: 142,
    name: "API et intégrations",
    keywords: [
      "api",
      "rest api",
      "wpgraphql",
      "intégration",
      "integration",
      "webhook",
      "connecter",
      "connexion",
    ],
  },
  {
    categoryId: 141,
    name: "Développement sur mesure",
    keywords: [
      "développement sur mesure",
      "developpement sur mesure",
      "plugin sur mesure",
      "thème sur mesure",
      "theme sur mesure",
    ],
  },
  {
    categoryId: 14,
    name: "WordPress",
    keywords: [
      "wordpress",
      "gutenberg",
      "plugin wordpress",
      "thème wordpress",
      "theme wordpress",
    ],
  },
  {
    categoryId: 144,
    name: "Commerce Layer",
    keywords: ["commerce layer"],
  },
  {
    categoryId: 145,
    name: "Commerce composable",
    keywords: [
      "commerce composable",
      "composable commerce",
    ],
  },
  {
    categoryId: 143,
    name: "Commerce headless",
    keywords: [
      "commerce headless",
      "e-commerce headless",
      "ecommerce headless",
    ],
  },
  {
    categoryId: 146,
    name: "PIM et ERP",
    keywords: ["pim", "erp"],
  },
];

function detectCategories(subject) {
  const normalized = subject.toLowerCase();

  const matches = CATEGORY_MAP.filter((item) =>
    item.keywords.some((keyword) =>
      normalized.includes(keyword.toLowerCase())
    )
  );

  const unique = [];
  const seen = new Set();

  for (const item of matches) {
    if (!seen.has(item.categoryId)) {
      seen.add(item.categoryId);
      unique.push(item);
    }
  }

  return unique;
}

function getWpAuthHeader() {
  const token = Buffer.from(
    `${WP_USERNAME}:${WP_APP_PASSWORD}`
  ).toString("base64");

  return `Basic ${token}`;
}

/**
 * Création brouillon + Slim SEO
 */
async function createWordPressDraft({
  title,
  content,
  excerpt = "",
  slug = "",
  meta_title = "",
  meta_description = "",
  categoryIds = [],
}) {
  const payload = {
    title,
    content,
    excerpt,
    slug,
    status: "draft",
    categories: categoryIds,

    meta: {
      slim_seo: {
        title: meta_title,
        description: meta_description,
      },
    },
  };

  const response = await fetch(
    `${WP_URL}/wp-json/wp/v2/posts`,
    {
      method: "POST",
      headers: {
        Authorization: getWpAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `WordPress error ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return {
    success: true,
    post_id: data.id,
    status: data.status,
    title: data.title?.rendered ?? title,
    link: data.link,
    categories: data.categories,
    meta_title,
    meta_description,
  };
}

async function main() {
  const detectedCategories = detectCategories(subject);

  const categoryIds = detectedCategories.map(
    (category) => category.categoryId
  );

  console.log("");
  console.log("Sujet :", subject);

  if (detectedCategories.length > 0) {
    console.log(
      "Catégories détectées :",
      detectedCategories
        .map(
          (category) =>
            `${category.name} (${category.categoryId})`
        )
        .join(", ")
    );
  }

  console.log("");
  console.log("Création de la session...");

  const stream =
    await client.beta.agents.sessions.create({
      agent_id: AGENT_ID,

      agent: {
        tools: [
          {
            type: "web_search",
            mode: "live",
            context_size: "medium",
          },

          {
            type: "function",
            name: "create_wordpress_draft",

            description:
              "Crée un nouvel article WordPress en brouillon sur Naxialis avec son contenu, ses catégories et ses métadonnées Slim SEO.",

            parameters: {
              type: "object",

              properties: {
                title: {
                  type: "string",
                  description:
                    "Titre WordPress de l'article",
                },

                content: {
                  type: "string",
                  description:
                    "Contenu HTML complet de l'article",
                },

                excerpt: {
                  type: "string",
                  description:
                    "Extrait court WordPress",
                },

                slug: {
                  type: "string",
                  description:
                    "Slug WordPress",
                },

                meta_title: {
                  type: "string",
                  description:
                    "Meta title Slim SEO, idéalement 50 à 60 caractères",
                },

                meta_description: {
                  type: "string",
                  description:
                    "Meta description Slim SEO, idéalement 140 à 160 caractères",
                },
              },

              required: [
                "title",
                "content",
                "excerpt",
                "slug",
                "meta_title",
                "meta_description",
              ],

              additionalProperties: false,
            },
          },
        ],
      },

      environment: {
        type: "none",
      },

      input: `
Crée un article complet pour le blog Naxialis sur :

"${subject}"

Tu dois :

- faire une recherche récente ;
- privilégier les sources officielles ;
- comprendre l'intention de recherche ;
- rédiger un article utile et concret ;
- structurer avec H2 et H3 ;
- générer la FAQ au format accordéon Tailwind prévu dans tes instructions ;
- intégrer le JSON-LD FAQ ;
- ajouter un extrait WordPress ;
- proposer un slug court ;
- générer un meta title Slim SEO ;
- générer une meta description Slim SEO ;
- intégrer des liens internes pertinents vers Naxialis ;
- terminer par un CTA cohérent ;
- appeler obligatoirement create_wordpress_draft.

Règles Slim SEO :

- meta_title : idéalement entre 50 et 60 caractères ;
- meta_description : idéalement entre 140 et 160 caractères ;
- ne pas ajouter automatiquement "NAXIALIS" au meta title sauf si cela reste pertinent et sous 60 caractères ;
- ne pas dupliquer exactement le titre WordPress si une variante SEO plus efficace est possible ;
- intégrer naturellement le sujet principal ;
- éviter le keyword stuffing ;
- la meta description doit expliquer clairement le bénéfice du contenu et encourager le clic sans formulation excessive.

Ne considère pas la tâche terminée avant que create_wordpress_draft ait été appelée.
`,

      stream: true,
    });

  let sessionId = null;

  try {
    for await (const event of stream) {
      if (
        event.type !==
          "agent.session.turn.output_text.delta" &&
        event.type !==
          "agent.session.turn.reasoning_summary_text.delta"
      ) {
        console.log("EVENT :", event.type);
      }

      if (event.type === "agent.session.created") {
        sessionId = event.session.id;
        console.log("Session :", sessionId);
      }

      if (
        event.type ===
        "agent.session.turn.output_text.done"
      ) {
        console.log("");
        console.log("Agent :", event.text);
        console.log("");
      }

      if (
        event.type ===
        "agent.session.requires_action"
      ) {
        const session =
          await client.beta.agents.sessions.retrieve(
            sessionId
          );

        for (
          const action of session.required_actions ?? []
        ) {
          if (
            action.type === "function_call" &&
            action.name ===
              "create_wordpress_draft"
          ) {
            const args =
              typeof action.arguments === "string"
                ? JSON.parse(action.arguments)
                : action.arguments;

            console.log("");
            console.log(
              "→ Appel create_wordpress_draft"
            );

            console.log(
              "Titre :",
              args.title
            );

            console.log(
              "Meta title :",
              args.meta_title
            );

            console.log(
              `Meta title length : ${args.meta_title?.length ?? 0}`
            );

            console.log(
              "Meta description :",
              args.meta_description
            );

            console.log(
              `Meta description length : ${args.meta_description?.length ?? 0}`
            );

            console.log(
              "Catégories :",
              detectedCategories
                .map((c) => c.name)
                .join(", ")
            );

            const result =
              await createWordPressDraft({
                ...args,
                categoryIds,
              });

            console.log("");
            console.log(
              "✅ Brouillon WordPress créé"
            );
            console.log("ID :", result.post_id);
            console.log(
              "Statut :",
              result.status
            );
            console.log(
              "Lien :",
              result.link
            );

            await client.beta.agents.sessions.events.create(
              sessionId,
              {
                events: [
                  {
                    type:
                      "agent.session.input.tool_result",
                    turn_id:
                      action.turn_id,
                    call_id:
                      action.call_id,
                    success: true,
                    output:
                      JSON.stringify(result),
                  },
                ],
              }
            );

            console.log(
              "→ Résultat renvoyé à l'agent"
            );
          }
        }
      }

      if (
        event.type ===
        "agent.session.turn.completed"
      ) {
        console.log("");
        console.log("✅ Tour terminé.");
        break;
      }

      if (
        event.type ===
        "agent.session.turn.failed"
      ) {
        console.error("❌ Tour échoué");
        console.dir(event, {
          depth: null,
        });
        break;
      }

      if (
        event.type ===
        "agent.session.turn.cancelled"
      ) {
        console.log("⚠️ Tour annulé.");
        break;
      }
    }
  } finally {
    stream.controller?.abort();
  }
}

main().catch((error) => {
  console.error("");
  console.error("ERREUR GLOBALE :");
  console.error(error);
  process.exit(1);
});