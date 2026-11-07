import { CopySessionId } from "./CopySessionId";

export function displayMetric(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return value;
}

const cards = [
  { key: "cost", label: "Coût LLM estimé" },
  { key: "input", label: "Tokens d'entrée" },
  { key: "cache", label: "Tokens en cache" },
  { key: "output", label: "Tokens de sortie" },
  { key: "reasoning", label: "Tokens de raisonnement" },
  { key: "total", label: "Tokens totaux" },
  { key: "model", label: "Modèle" },
  { key: "duration", label: "Durée de génération" },
] as const;

export function GenerationUsage({
  cost,
  inputTokens,
  cachedTokens,
  outputTokens,
  reasoningTokens,
  totalTokens,
  model,
  duration,
  sessionId,
}: {
  cost: string;
  inputTokens: string;
  cachedTokens: string;
  outputTokens: string;
  reasoningTokens: string;
  totalTokens: string;
  model: string;
  duration: string;
  sessionId: string | null;
}) {
  const values: Record<(typeof cards)[number]["key"], string> = {
    cost: displayMetric(cost),
    input: displayMetric(inputTokens),
    cache: displayMetric(cachedTokens),
    output: displayMetric(outputTokens),
    reasoning: displayMetric(reasoningTokens),
    total: displayMetric(totalTokens),
    model: displayMetric(model),
    duration: displayMetric(duration),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.key}
            className="min-w-0 rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
            <h3 className="text-xs font-medium text-slate-500">{card.label}</h3>
            <p className="mt-2 text-lg font-semibold break-words text-slate-900">
              {values[card.key]}
            </p>
            {card.key === "cost" ? (
              <p className="mt-1 text-xs text-slate-500">
                Hors éventuels frais liés aux outils.
              </p>
            ) : null}
          </article>
        ))}
      </div>
      <CopySessionId value={sessionId} />
    </div>
  );
}
