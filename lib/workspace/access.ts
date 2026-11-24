import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  resolveActiveWorkspace,
  type EditorialWorkspaceRecord,
} from "./context";
import { WorkspaceContextError } from "./errors";
import { assertSameWorkspace } from "./guards";
import { workspaceWhere } from "./scope";

/**
 * Accès ressource isolé par espace actif.
 * - Le cookie définit uniquement le contexte actif (jamais une autorisation d’ID).
 * - Une ressource d’un autre espace → introuvable (404), sans bascule d’espace.
 * - Aucune donnée croisée pour métadonnées / RSC.
 */

export async function getActiveWorkspaceContext(): Promise<EditorialWorkspaceRecord> {
  return resolveActiveWorkspace();
}

export async function loadGenerationInActiveWorkspace(id: string) {
  const workspace = await resolveActiveWorkspace();
  const generation = await db.articleGeneration.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
  });
  return { workspace, generation };
}

/** Pour generateMetadata : jamais de titre/sujet hors espace. */
export async function loadGenerationMetaInActiveWorkspace(id: string): Promise<{
  title: string | null;
  subject: string;
} | null> {
  const workspace = await resolveActiveWorkspace();
  return db.articleGeneration.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
    select: { title: true, subject: true },
  });
}

export async function requireGenerationInActiveWorkspace(id: string) {
  const { workspace, generation } = await loadGenerationInActiveWorkspace(id);
  if (!generation) {
    notFound();
  }
  return { workspace, generation };
}

export async function loadTopicInActiveWorkspace(id: string) {
  const workspace = await resolveActiveWorkspace();
  const topic = await db.topic.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
  });
  return { workspace, topic };
}

export async function requireTopicInActiveWorkspace(id: string) {
  const { workspace, topic } = await loadTopicInActiveWorkspace(id);
  if (!topic) {
    notFound();
  }
  return { workspace, topic };
}

/**
 * Vérifie qu’un enregistrement déjà chargé appartient à l’espace actif.
 * Utile dans les routes API après findUnique par id.
 */
export async function assertRecordInActiveWorkspace(
  record: { workspaceId: string | null | undefined } | null | undefined,
  entityLabel = "ressource"
): Promise<EditorialWorkspaceRecord> {
  const workspace = await resolveActiveWorkspace();
  if (!record) {
    throw new WorkspaceContextError(
      "WORKSPACE_MISMATCH",
      `${entityLabel} introuvable dans cet espace éditorial.`,
      404
    );
  }
  assertSameWorkspace(workspace.id, record.workspaceId, entityLabel);
  return workspace;
}

/** Options Next.js pour pages isolées (pas de cache partagé croisé). */
export const WORKSPACE_RSC_DYNAMIC = {
  dynamic: "force-dynamic" as const,
  revalidate: 0 as const,
};
