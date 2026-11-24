import Link from "next/link";

export function displayField(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function Field({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm break-words text-slate-900">{value}</dd>
    </div>
  );
}

export function ArticleSeoPanel({
  subject,
  preferredTitle,
  title,
  excerpt,
  slug,
  categories,
  metaTitle,
  metaDescription,
  wpPostId,
  wpUrl,
  cmsDestination,
  cmsExternalId,
  wpStatus,
}: {
  subject: string;
  preferredTitle?: string | null;
  title: string | null;
  excerpt: string | null;
  slug: string | null;
  categories: string;
  metaTitle: string | null;
  metaDescription: string | null;
  wpPostId: number | null;
  wpUrl: string | null;
  cmsDestination?: string | null;
  cmsExternalId?: string | null;
  wpStatus?: string | null;
}) {
  const isWebflow = cmsDestination === "webflow";

  return (
    <section className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">
      <h2 className="text-sm font-semibold text-slate-900">Article et référencement</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Sujet demandé" value={displayField(subject)} wide />
        {preferredTitle ? (
          <Field
            label="Titre souhaité"
            value={displayField(preferredTitle)}
            wide
          />
        ) : null}
        <Field label="Titre final" value={displayField(title)} wide />
        <Field label="Extrait" value={displayField(excerpt)} wide />
        <Field label="Slug" value={displayField(slug)} />
        {!isWebflow ? (
          <Field label="Catégories" value={displayField(categories)} />
        ) : (
          <Field label="Destination" value="Webflow" />
        )}
        <Field label="Meta title" value={displayField(metaTitle)} wide />
        <Field label="Meta description" value={displayField(metaDescription)} wide />
        {isWebflow ? (
          <>
            <Field
              label="Identifiant CMS Webflow"
              value={displayField(cmsExternalId)}
            />
            <Field
              label="Statut à la création"
              value={wpStatus?.trim() ? wpStatus.trim() : "draft"}
            />
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">Lien</dt>
              <dd className="mt-1 text-sm text-slate-500">
                Aucun lien d’édition fabriqué pour Webflow.
              </dd>
            </div>
          </>
        ) : (
          <>
            <Field
              label="Identifiant WordPress"
              value={wpPostId ? `#${wpPostId}` : "—"}
            />
            <div>
              <dt className="text-xs font-medium text-slate-500">Lien WordPress</dt>
              <dd className="mt-1 text-sm break-all">
                {wpUrl ? (
                  <Link
                    href={wpUrl}
                    className="text-naxialis hover:text-naxialis-dark"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {wpUrl}
                    <span className="sr-only">, nouvel onglet</span>
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </>
        )}
      </dl>
    </section>
  );
}
