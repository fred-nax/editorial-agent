import {
  isTitleApproach,
  TITLE_APPROACHES,
  type TitleApproach,
} from "./config";

export type { TitleApproach };
export type TitleSuggestion = {
  title: string;
  approach: TitleApproach;
};

export function approachLabel(approach: TitleApproach): string {
  switch (approach) {
    case "tutoriel":
      return "Tutoriel";
    case "guide":
      return "Guide pratique";
    case "comparaison":
      return "Comparaison";
    case "analyse":
      return "Analyse";
    case "liste":
      return "Liste pratique";
    default:
      return approach;
  }
}

export { isTitleApproach, TITLE_APPROACHES };
