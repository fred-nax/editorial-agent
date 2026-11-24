import { normalizeCmsDestination } from "@/lib/cms/types";

export function CmsDestinationBadge({
  destination,
  className = "",
}: {
  destination?: string | null;
  className?: string;
}) {
  const id = normalizeCmsDestination(destination);
  const isWebflow = id === "webflow";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        isWebflow
          ? "border-violet-200 bg-violet-50 text-violet-900"
          : "border-sky-200 bg-sky-50 text-sky-900"
      } ${className}`}
    >
      {isWebflow ? "Webflow" : "WordPress"}
    </span>
  );
}
