import Link from "next/link";

export function AnalyticsEmptyState({
  title,
  description,
  showSettingsLink = false,
}: {
  title: string;
  description: string;
  showSettingsLink?: boolean;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p>
      {showSettingsLink ? (
        <Link
          href="/settings"
          className="mt-3 inline-flex text-sm font-medium text-naxialis outline-none hover:text-naxialis-dark focus-visible:ring-2 focus-visible:ring-naxialis/35"
        >
          Ouvrir les paramètres Google
        </Link>
      ) : null}
    </div>
  );
}
