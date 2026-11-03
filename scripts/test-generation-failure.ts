import "dotenv/config";
import { db } from "../lib/db.js";
import { processArticleGeneration } from "../lib/generation.js";

const subject = "Test local d’échec volontaire";

const generation = await db.articleGeneration.create({
  data: {
    subject,
    status: "queued",
  },
});

await processArticleGeneration(generation.id, {
  run: async () => {
    throw new Error("Erreur volontaire de test avant appel externe.");
  },
});

const stored = await db.articleGeneration.findUnique({
  where: { id: generation.id },
});

if (stored?.status !== "failed" || !stored.error || stored.durationMs === null) {
  console.error("Le test d’échec n’a pas marqué la génération comme failed.");
  process.exit(1);
}

console.log("generationId", stored.id);
console.log("status", stored.status);
console.log("error", stored.error);
console.log("durationMs", stored.durationMs);
