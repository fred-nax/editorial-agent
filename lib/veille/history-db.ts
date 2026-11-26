import { db } from "@/lib/db";
import {
  isVeilleCountry,
  isVeillePeriod,
  parseWatchSnapshot,
  resultFromSnapshot,
  type WatchHistoryStore,
  type WatchSearchRecord,
  type WatchSearchSummary,
} from "./history";
import { VEILLE_COUNTRIES } from "./types";

type WatchRow = {
  id: string;
  theme: string;
  periodDays: number;
  country: string;
  searchedAt: Date;
  articleCount: number;
  status: string;
  results?: unknown;
};

function toSummary(row: WatchRow): WatchSearchSummary | null {
  if (
    !isVeillePeriod(row.periodDays) ||
    !isVeilleCountry(row.country) ||
    row.status !== "completed" ||
    !Number.isInteger(row.articleCount) ||
    row.articleCount < 0
  ) {
    return null;
  }
  const country = VEILLE_COUNTRIES.find((item) => item.code === row.country);
  return {
    id: row.id,
    theme: row.theme,
    periodDays: row.periodDays,
    country: row.country,
    countryLabel: country?.label ?? row.country,
    searchedAt: row.searchedAt.toISOString(),
    articleCount: row.articleCount,
    status: "completed",
  };
}

function toRecord(row: WatchRow): WatchSearchRecord | null {
  const summary = toSummary(row);
  const snapshot = parseWatchSnapshot(row.results);
  if (!summary || !snapshot || summary.articleCount !== snapshot.articles.length) {
    return null;
  }
  return {
    ...summary,
    result: resultFromSnapshot(summary, snapshot),
  };
}

export function prismaWatchHistoryStore(
  workspaceId: string
): WatchHistoryStore {
  const scopedWorkspaceId = workspaceId?.trim();
  if (!scopedWorkspaceId) {
    throw new Error(
      "workspaceId obligatoire pour la veille — tâche bloquée (espace absent)."
    );
  }
  return {
    async save(input) {
      const row = await db.editorialWatchSearch.create({
        data: {
          workspaceId: scopedWorkspaceId,
          theme: input.theme,
          periodDays: input.periodDays,
          country: input.country,
          searchedAt: input.searchedAt,
          articleCount: input.articleCount,
          results: input.snapshot,
          status: "completed",
        },
      });
      const summary = toSummary(row);
      if (!summary) {
        throw new Error("Recherche enregistrée illisible.");
      }
      return summary;
    },
    async list(page, pageSize) {
      const [rows, total] = await Promise.all([
        db.editorialWatchSearch.findMany({
          where: { workspaceId: scopedWorkspaceId },
          orderBy: { searchedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            theme: true,
            periodDays: true,
            country: true,
            searchedAt: true,
            articleCount: true,
            status: true,
          },
        }),
        db.editorialWatchSearch.count({
          where: { workspaceId: scopedWorkspaceId },
        }),
      ]);
      return {
        items: rows.flatMap((row) => {
          const summary = toSummary(row);
          return summary ? [summary] : [];
        }),
        total,
      };
    },
    async read(searchId) {
      const row = await db.editorialWatchSearch.findFirst({
        where: { id: searchId, workspaceId: scopedWorkspaceId },
      });
      if (!row) {
        return null;
      }
      const record = toRecord(row);
      if (!record) {
        throw new Error("Recherche enregistrée illisible.");
      }
      return record;
    },
    async delete(searchId) {
      const existing = await db.editorialWatchSearch.findFirst({
        where: { id: searchId, workspaceId: scopedWorkspaceId },
        select: { id: true },
      });
      if (!existing) {
        return false;
      }
      await db.editorialWatchSearch.deleteMany({
        where: { id: searchId, workspaceId: scopedWorkspaceId },
      });
      return true;
    },
  };
}
