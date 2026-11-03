export type WordPressCategory = {
  categoryId: number;
  name: string;
  keywords: string[];
};

export const CATEGORY_MAP: WordPressCategory[] = [
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

export function detectCategories(subject: string): WordPressCategory[] {
  const normalized = subject.toLowerCase();

  const matches = CATEGORY_MAP.filter((item) =>
    item.keywords.some((keyword) =>
      normalized.includes(keyword.toLowerCase())
    )
  );

  const unique: WordPressCategory[] = [];
  const seen = new Set<number>();

  for (const item of matches) {
    if (!seen.has(item.categoryId)) {
      seen.add(item.categoryId);
      unique.push(item);
    }
  }

  return unique;
}
