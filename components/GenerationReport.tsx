import type { ReactNode } from "react";
import {
  buildGenerationReport,
  type ReportLine,
} from "@/lib/generation-report";

const DISPLAY_LABELS: Record<string, string> = {
  Origine: "Origine",
  "Titre demandé": "Titre demandé",
  "Angle transmis": "Angle éditorial",
  "Notes transmises": "Notes",
  "Public cible": "Public cible",
  "Objectif éditorial": "Objectif éditorial",
  "Langue de rédaction": "Langue de rédaction",
  "Mots-clés suggérés": "Mots-clés suggérés",
  "Titre de la publication": "Publication source",
  Média: "Média",
  "URL transmise": "URL",
  "Date vérifiée": "Date",
  "Type de publication": "Type",
  "Contexte documentaire": "Contexte documentaire",
};

function isUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

function ContextFields({ lines }: { lines: ReportLine[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {lines.map((line) => (
        <div
          key={line.label}
          className={
            line.label === "Notes transmises" ||
            line.label === "Mots-clés suggérés"
              ? "sm:col-span-2"
              : undefined
          }
        >
          <dt className="text-xs font-medium text-slate-500">
            {DISPLAY_LABELS[line.label] ?? line.label}
          </dt>
          <dd className="mt-1 text-sm break-words text-slate-900">
            {isUrl(line.value) ? (
              <a
                href={line.value}
                className="break-all text-naxialis hover:text-naxialis-dark"
                target="_blank"
                rel="noreferrer"
              >
                {line.value}
                <span className="sr-only">, nouvel onglet</span>
              </a>
            ) : (
              line.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function GenerationReport({
  trace,
  status,
  wpPostId,
  wpUrl,
  wpStatus,
  cmsDestination,
  cmsExternalId,
}: {
  trace: unknown;
  status: string;
  wpPostId: number | null;
  wpUrl: string | null;
  wpStatus: string | null;
  cmsDestination?: string | null;
  cmsExternalId?: string | null;
}) {
  const report = buildGenerationReport({
    trace,
    status,
    wpPostId,
    wpUrl,
    wpStatus,
    cmsDestination,
    cmsExternalId,
  });
  const isWebflow = report.cms.destination === "webflow";

  return (
    <div className="space-y-4">
      {report.recorded ? (
        <>
          <Section title="Contexte éditorial">
            <ContextFields lines={report.contextLines} />
          </Section>
          <Section title="Recherches effectuées">
            <p className="text-sm text-slate-600">
              {report.queries.length} recherche{report.queries.length > 1 ? "s" : ""} observée
              {report.queries.length > 1 ? "s" : ""}.
            </p>
            {report.queries.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {report.queries.map((query) => (
                  <li
                    key={query}
                    className="rounded-md bg-slate-50 px-3 py-2 text-sm break-words text-slate-900"
                  >
                    {query}
                  </li>
                ))}
              </ul>
            ) : null}
            {report.queriesNote ? (
              <p className="mt-2 text-sm text-slate-600">{report.queriesNote}</p>
            ) : null}
          </Section>
          <Section title="Pages consultées">
            <p className="text-sm text-slate-600">
              {report.pages.length} page{report.pages.length > 1 ? "s" : ""} ouverte
              {report.pages.length > 1 ? "s" : ""}.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              URL présentes dans les événements open_page ou find_in_page.
            </p>
            {report.pages.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {report.pages.map((page) => (
                  <li key={`${page.via}:${page.url}`} className="min-w-0 text-sm">
                    <a
                      href={page.url}
                      className="break-all text-naxialis hover:text-naxialis-dark"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {page.url}
                      <span className="sr-only">, nouvel onglet</span>
                    </a>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {page.via === "open_page" ? "Ouverture de page" : "Recherche dans la page"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {report.pagesNote ? (
              <p className="mt-2 text-sm text-slate-600">{report.pagesNote}</p>
            ) : null}
            {report.searchIsNotConsultation ? (
              <p className="mt-1 text-xs text-slate-500">{report.searchIsNotConsultation}</p>
            ) : null}
          </Section>
        </>
      ) : (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
          <p className="text-sm text-slate-700">{report.unrecordedMessage}</p>
        </section>
      )}

      <Section title={isWebflow ? "Résultat Webflow" : "Résultat WordPress"}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-slate-500">
              {isWebflow ? "Identifiant CMS" : "Identifiant"}
            </dt>
            <dd className="mt-1 text-sm break-all text-slate-900">
              {isWebflow
                ? report.cms.externalId ?? "—"
                : report.wordpress.id ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">
              Statut à la création
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {report.cms.statusAtCreation}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-slate-500">
              {isWebflow ? "Lien" : "Lien"}
            </dt>
            <dd className="mt-1 text-sm break-all">
              {isWebflow ? (
                <span className="text-slate-500">
                  Aucun lien d’édition fabriqué
                </span>
              ) : report.wordpress.url ? (
                <a
                  href={report.wordpress.url}
                  className="text-naxialis hover:text-naxialis-dark"
                  target="_blank"
                  rel="noreferrer"
                >
                  {report.wordpress.url}
                  <span className="sr-only">, nouvel onglet</span>
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">{report.statusNote}</p>
      </Section>
      <p className="text-xs text-slate-500">{report.disclaimer}</p>
    </div>
  );
}
