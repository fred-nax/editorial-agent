export const ARTICLE_DETAIL_TABS = [
  { id: "report", label: "Rapport de génération" },
  { id: "article", label: "Article & SEO" },
  { id: "usage", label: "Consommation OpenAI" },
  { id: "featured", label: "Image à la une" },
  { id: "performances", label: "Performances SEO" },
] as const;

export type ArticleDetailTabId = (typeof ARTICLE_DETAIL_TABS)[number]["id"];

export type ArticleDetailTab = (typeof ARTICLE_DETAIL_TABS)[number];

/**
 * Onglets visibles selon la destination CMS.
 * V7.14.0 : Performances SEO aussi pour Webflow (état brouillon / publié sans données).
 */
export function getArticleDetailTabs(
  _cmsDestination?: string | null
): readonly ArticleDetailTab[] {
  return ARTICLE_DETAIL_TABS;
}

export function moveArticleDetailTab(
  current: ArticleDetailTabId,
  key: string,
  tabs: readonly ArticleDetailTab[] = ARTICLE_DETAIL_TABS
): ArticleDetailTabId {
  if (tabs.length === 0) {
    return current;
  }
  const index = tabs.findIndex((tab) => tab.id === current);
  const safeIndex = index < 0 ? 0 : index;
  if (key === "ArrowRight") {
    return tabs[(safeIndex + 1) % tabs.length]!.id;
  }
  if (key === "ArrowLeft") {
    return tabs[(safeIndex - 1 + tabs.length) % tabs.length]!.id;
  }
  if (key === "Home") {
    return tabs[0]!.id;
  }
  if (key === "End") {
    return tabs[tabs.length - 1]!.id;
  }
  return current;
}
