import "dotenv/config";
import { buildInternalLinkPlan } from "../lib/agent/internal-links";

const subjects = [
  "Sécurité MCP pour les agents IA et les outils connectés",
  "Cybersécurité WordPress : se protéger des failles PHP",
  "Mettre en place DMARC pour sécuriser la messagerie",
  "Réglementation maritime des phares islandais en 1820",
];

for (const subject of subjects) {
  const plan = await buildInternalLinkPlan(subject);
  console.log("\n===", subject);
  console.log(
    "themes:",
    plan.themes.join(", ") || "(none)",
    "| catalog:",
    plan.catalogSize,
    "| stale:",
    plan.catalogStale
  );
  if (plan.selected.length === 0) {
    console.log("selected: (none)");
  }
  for (const item of plan.selected) {
    console.log(
      `- [${Math.round(item.score * 100)}%] ${item.title}\n  ${item.url}\n  ${item.justification}`
    );
  }
  const hubs = plan.selected.filter((item) =>
    /facturation|brevo|applications-saas/i.test(item.url)
  );
  if (hubs.length && /MCP|cybersécurité|DMARC/i.test(subject)) {
    console.log("WARN hub hors contexte:", hubs.map((h) => h.url).join(", "));
  }
}
