/** Construit l’URL REST paginée (lecture seule) — pure, sans secrets. */
export function buildWordPressInventoryUrl(params: {
  baseUrl: string;
  page: number;
  perPage: number;
  status?: string;
  context?: "view" | "edit";
  modifiedAfter?: Date | null;
  fields?: string;
}): string {
  const url = new URL(
    `${params.baseUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`
  );
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("per_page", String(params.perPage));
  url.searchParams.set("status", params.status ?? "publish");
  url.searchParams.set("context", params.context ?? "view");
  url.searchParams.set(
    "_fields",
    params.fields ??
      "id,slug,link,status,date_gmt,modified_gmt,title,excerpt,content,categories"
  );
  if (params.modifiedAfter) {
    url.searchParams.set("modified_after", params.modifiedAfter.toISOString());
  }
  return url.toString();
}

/** Calcule le nombre de pages à parcourir à partir des en-têtes WP. */
export function resolveInventoryPagePlan(input: {
  page: number;
  perPage: number;
  postsOnPage: number;
  headerTotal: number | null;
  headerTotalPages: number | null;
}): {
  totalPages: number;
  shouldContinue: boolean;
  headerInconsistent: boolean;
} {
  const headerPages =
    input.headerTotalPages !== null &&
    Number.isFinite(input.headerTotalPages) &&
    input.headerTotalPages > 0
      ? input.headerTotalPages
      : null;

  const derivedFromTotal =
    input.headerTotal !== null &&
    Number.isFinite(input.headerTotal) &&
    input.headerTotal > 0
      ? Math.max(1, Math.ceil(input.headerTotal / input.perPage))
      : null;

  // Si l’en-tête annonce plus de pages que le contenu réel le permet,
  // on s’arrête dès qu’une page est vide ou incomplète sous le per_page
  // uniquement lorsque la page suivante n’a plus d’items.
  let totalPages = headerPages ?? derivedFromTotal ?? input.page;
  if (headerPages && derivedFromTotal && headerPages !== derivedFromTotal) {
    totalPages = Math.max(headerPages, derivedFromTotal);
  }

  const headerInconsistent =
    input.headerTotal !== null &&
    input.postsOnPage > 0 &&
    input.postsOnPage < input.perPage &&
    input.headerTotal > input.postsOnPage &&
    input.page === 1;

  return {
    totalPages,
    shouldContinue: input.postsOnPage > 0 && input.page < totalPages,
    headerInconsistent,
  };
}
