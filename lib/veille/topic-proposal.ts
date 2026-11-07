import type { VeilleArticle, VeilleKind } from "./types";

export type VeilleTopicProposal = {
  subject: string;
  angle: string;
  summary: string;
  category: string;
  kind: VeilleKind;
  sourceUrl: string;
  sourceTitle: string;
  sourceName: string;
  publishedOn: string | null;
  dateVerified: boolean;
};

export function buildTopicProposal(
  article: VeilleArticle,
  theme: string,
  selection?: { subject: string; angle: string }
): VeilleTopicProposal {
  return {
    subject: (selection?.subject ?? article.title).trim().slice(0, 500),
    angle: (selection?.angle ?? article.event ?? "").trim().slice(0, 240),
    summary: article.summary,
    category: theme.slice(0, 120),
    kind: article.kind,
    sourceUrl: article.url,
    sourceTitle: article.title,
    sourceName: article.sourceName,
    publishedOn: article.publishedOn,
    dateVerified: article.dateVerified,
  };
}

export function toTopicCreateBody(
  proposal: VeilleTopicProposal,
  edits: { subject: string; angle: string }
) {
  return {
    subject: edits.subject,
    angle: edits.angle,
    notes: proposal.summary,
    category: proposal.category,
    origin: "veille" as const,
    sourceUrl: proposal.sourceUrl,
    sourceTitle: proposal.sourceTitle,
    sourceName: proposal.sourceName,
    sourcePublishedOn: proposal.dateVerified ? proposal.publishedOn : null,
    sourceKind: proposal.kind,
  };
}
