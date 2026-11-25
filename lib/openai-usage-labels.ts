export function operationTypeLabel(type: string): string {
  switch (type) {
    case "article_generation":
      return "Génération d’article";
    case "web_search":
      return "Recherche web";
    case "image_generation":
      return "Génération d’image";
    case "image_alt":
      return "Texte ALT image";
    case "editorial_watch":
      return "Veille éditoriale";
    case "editorial_watch_suggestions":
      return "Suggestions de veille";
    case "seo_opportunity":
      return "Opportunités SEO";
    case "title_suggestion":
      return "Suggestions de titres";
    case "editorial_similarity":
      return "Analyse de similarité";
    default:
      return type;
  }
}
