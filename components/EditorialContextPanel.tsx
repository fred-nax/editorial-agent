import {
  editorialContextLines,
  parseStoredEditorialContext,
} from "@/lib/editorial-context";

export function EditorialContextPanel({ value }: { value: unknown }) {
  const context = parseStoredEditorialContext(value);
  const lines = editorialContextLines(context);
  if (lines.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-4 sm:px-5">
      <h2 className="text-sm font-semibold text-[#0F172A]">
        Indications éditoriales
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Préférences saisies pour cette génération. Elles n’ont pas remplacé les
        consignes permanentes de l’agent.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {lines.map((line) => (
          <div
            key={line.label}
            className={
              line.label === "Consignes complémentaires" ||
              line.label === "Angle éditorial" ||
              line.label === "Titre souhaité"
                ? "sm:col-span-2"
                : undefined
            }
          >
            <dt className="text-xs font-medium text-slate-500">{line.label}</dt>
            <dd className="mt-1 text-sm break-words text-[#0F172A]">
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
