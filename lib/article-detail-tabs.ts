export const ARTICLE_DETAIL_TABS = [
  { id: "report", label: "Rapport de génération" },
  { id: "article", label: "Article & SEO" },
  { id: "usage", label: "Consommation OpenAI" },
  { id: "featured", label: "Image à la une" },
] as const;

export type ArticleDetailTabId = (typeof ARTICLE_DETAIL_TABS)[number]["id"];

export function moveArticleDetailTab(
  current: ArticleDetailTabId,
  key: string
): ArticleDetailTabId {
  const index = ARTICLE_DETAIL_TABS.findIndex((tab) => tab.id === current);
  if (key === "ArrowRight") {
    return ARTICLE_DETAIL_TABS[(index + 1) % ARTICLE_DETAIL_TABS.length].id;
  }
  if (key === "ArrowLeft") {
    return ARTICLE_DETAIL_TABS[
      (index - 1 + ARTICLE_DETAIL_TABS.length) % ARTICLE_DETAIL_TABS.length
    ].id;
  }
  if (key === "Home") {
    return ARTICLE_DETAIL_TABS[0].id;
  }
  if (key === "End") {
    return ARTICLE_DETAIL_TABS[ARTICLE_DETAIL_TABS.length - 1].id;
  }
  return current;
}
