export const RAPPROCHEMENT_KINDS = [
  "probable_duplicate",
  "close",
  "complementary",
] as const;

export type RapprochementKind = (typeof RAPPROCHEMENT_KINDS)[number];

export type EditorialMatch = {
  kind: RapprochementKind;
  title: string;
  url: string;
  explanation: string;
  message: string;
  wpPostId: number;
  /** Score interne de tri uniquement — jamais affiché comme % SEO. */
  rankScore: number;
};

export type EditorialInventoryMeta = {
  coverage: "available" | "partial" | "unavailable";
  coverageNote: string;
  verified: boolean;
  lastSyncAt: string | null;
  inventoryStale: boolean;
  publishedCount: number;
};

export type EditorialRapprochementResult = EditorialInventoryMeta & {
  subject: string;
  matches: EditorialMatch[];
  hasMatches: boolean;
};

export const RAPPROCHEMENT_MESSAGES: Record<RapprochementKind, string> = {
  probable_duplicate:
    "Un article publié traite déjà de ce sujet. Vérifiez s’il est préférable de le mettre à jour.",
  close:
    "Ce sujet est proche d’un article existant. Précisez votre angle pour éviter les redondances.",
  complementary:
    "Cet article pourrait être intéressant pour le maillage interne.",
};

export const RAPPROCHEMENT_LABELS: Record<RapprochementKind, string> = {
  probable_duplicate: "Doublon probable",
  close: "Sujet proche",
  complementary: "Sujet complémentaire",
};

export function isRapprochementKind(value: string): value is RapprochementKind {
  return (RAPPROCHEMENT_KINDS as readonly string[]).includes(value);
}
