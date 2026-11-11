import "dotenv/config";
import { createRequire } from "node:module";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { logInfo } from "./logger";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaToken?: string;
};

/** Change quand le schéma Prisma change, pour ne pas réutiliser un client généré avant. */
const PRISMA_CLIENT_TOKEN = "featured-image-v7-1-20261111";

type PrismaModule = {
  PrismaClient: typeof PrismaClient;
  Prisma: typeof Prisma;
};

function topicHasOrigin(prisma: typeof Prisma): boolean {
  const topic = prisma.dmmf.datamodel.models.find((model) => model.name === "Topic");
  return topic?.fields.some((field) => field.name === "origin") ?? false;
}

function articleGenerationHasTrace(prisma: typeof Prisma): boolean {
  const generation = prisma.dmmf.datamodel.models.find(
    (model) => model.name === "ArticleGeneration"
  );
  return generation?.fields.some((field) => field.name === "trace") ?? false;
}

function editorialWatchSearchExists(prisma: typeof Prisma): boolean {
  return prisma.dmmf.datamodel.models.some((model) => model.name === "EditorialWatchSearch");
}

function articleFeaturedImageExists(prisma: typeof Prisma): boolean {
  return prisma.dmmf.datamodel.models.some(
    (model) => model.name === "ArticleFeaturedImage"
  );
}

function clientMatchesSchema(prisma: typeof Prisma): boolean {
  return (
    topicHasOrigin(prisma) &&
    articleGenerationHasTrace(prisma) &&
    editorialWatchSearchExists(prisma) &&
    articleFeaturedImageExists(prisma)
  );
}

function loadPrismaModule(): PrismaModule {
  const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
  for (const cacheKey of Object.keys(nodeRequire.cache)) {
    const normalized = cacheKey.replaceAll("\\", "/");
    if (
      normalized.includes("/.prisma/client/") ||
      normalized.includes("/@prisma/client/")
    ) {
      delete nodeRequire.cache[cacheKey];
    }
  }
  return nodeRequire("@prisma/client") as PrismaModule;
}

function createPrismaClient(Client: typeof PrismaClient): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("Variable d'environnement manquante : DATABASE_URL");
  }

  const adapter = new PrismaPg({ connectionString });
  return new Client({ adapter });
}

function currentPrismaClient(): PrismaClient {
  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaToken === PRISMA_CLIENT_TOKEN
  ) {
    return globalForPrisma.prisma;
  }

  const importedMatches = clientMatchesSchema(Prisma);
  let Client = PrismaClient;
  let matchesSchema = importedMatches;
  if (!matchesSchema) {
    const loaded = loadPrismaModule();
    Client = loaded.PrismaClient;
    matchesSchema = clientMatchesSchema(loaded.Prisma);
    logInfo(
      "db",
      `prisma module reloaded trace=${matchesSchema ? "yes" : "no"}`
    );
  } else if (process.env.NODE_ENV !== "production") {
    logInfo("db", "prisma ready trace=yes");
  }

  if (!matchesSchema && globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const previous = globalForPrisma.prisma;
  const client = createPrismaClient(Client);
  globalForPrisma.prisma = client;
  globalForPrisma.prismaToken = matchesSchema ? PRISMA_CLIENT_TOKEN : undefined;
  if (previous && previous !== client) {
    void previous.$disconnect().catch(() => undefined);
  }
  return client;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = currentPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
