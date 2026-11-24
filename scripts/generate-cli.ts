import { runAgentSession } from "../lib/agent/run-session.js";

const subject = process.argv.slice(2).join(" ").trim();

if (!subject) {
  console.error("Sujet manquant.");
  console.error(
    'Exemple : npm run generate:cli -- "Comment connecter WooCommerce à Pennylane"'
  );
  process.exit(1);
}

try {
  const result = await runAgentSession(subject, {
    onLog: (message) => console.log(message),
    onProgress: (progress) => {
      console.log(`[progress] ${progress.stage} — ${progress.message}`);
    },
  });

  console.log("");
  console.log("Résultat :");
  console.log(`Session : ${result.sessionId}`);
  console.log(`Destination : ${result.cmsDestination}`);
  console.log(`CMS ID : ${result.cms.externalId}`);
  console.log(`Statut : ${result.cms.status}`);
  if (result.wordpress) {
    console.log(`WordPress ID : ${result.wordpress.postId}`);
    console.log(`Lien : ${result.wordpress.link}`);
  }
  console.log(`Modèle : ${result.model ?? "—"}`);
  console.log(
    `Tokens in/cached/out/reasoning/total : ${result.inputTokens ?? "—"} / ${result.cachedInputTokens ?? "—"} / ${result.outputTokens ?? "—"} / ${result.reasoningTokens ?? "—"} / ${result.totalTokens ?? "—"}`
  );
  console.log(`Coût LLM estimé : ${result.estimatedCost ?? "—"}`);
  console.log(
    `Usage delay/retries : ${result.usageCollection.delayMs} ms / ${result.usageCollection.retries}`
  );
} catch (error) {
  console.error("");
  console.error("ERREUR GLOBALE :");
  console.error(error);
  process.exit(1);
}
