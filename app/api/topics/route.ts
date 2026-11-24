import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import {
  hasSimilar,
  queueHasExact,
} from "@/lib/veille/editorial-duplicates";
import { assessVeilleProposal } from "@/lib/veille/editorial-corpus";
import {
  handleCreateTopic,
  type StoredTopic,
  type TopicStore,
} from "@/lib/topics/create";
import {
  assertModuleAllowedForWorkspace,
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
} from "@/lib/workspace";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function toStored(topic: {
  id: string;
  subject: string;
  priority: number;
  notes: string | null;
  category: string | null;
  angle: string | null;
  origin: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceName: string | null;
  sourcePublishedOn: string | null;
  sourceKind: string | null;
}): StoredTopic {
  return {
    id: topic.id,
    status: "pending",
    priority: topic.priority,
    subject: topic.subject,
    angle: topic.angle,
    notes: topic.notes,
    category: topic.category,
    origin: topic.origin === "veille" ? "veille" : null,
    sourceUrl: topic.sourceUrl,
    sourceTitle: topic.sourceTitle,
    sourceName: topic.sourceName,
    sourcePublishedOn: topic.sourcePublishedOn,
    sourceKind: topic.sourceKind,
  };
}

function topicStore(workspaceId: string): TopicStore {
  return {
    async findExactSource(sourceUrl, subject) {
      const found = await db.topic.findFirst({
        where: {
          ...workspaceWhere(workspaceId),
          sourceUrl,
          subject: { equals: subject, mode: "insensitive" },
        },
      });
      return found ? toStored(found) : null;
    },
    async create(data) {
      const topic = await db.topic.create({
        data: {
          ...data,
          workspaceId,
          status: "pending",
        },
      });
      return toStored(topic);
    },
  };
}

export async function GET() {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveActiveWorkspace();
    assertModuleAllowedForWorkspace(workspace, "topics");
    const topics = await db.topic.findMany({
      where: workspaceWhere(workspace.id),
      orderBy: [{ createdAt: "desc" }],
    });
    return NextResponse.json({ topics, workspaceId: workspace.id });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const session = await requireAuth();
  try {
    const workspace = await resolveActiveWorkspace();
    assertModuleAllowedForWorkspace(workspace, "topics");
    const result = await handleCreateTopic(request, {
      authenticated: Boolean(session?.user),
      store: topicStore(workspace.id),
      assess: async (input) => {
        const assessment = await assessVeilleProposal(input, workspace.id);
        return {
          queueExact: queueHasExact(assessment.result),
          similar: hasSimilar(assessment.result),
          matches: assessment.result.matches,
          coverage: assessment.coverage,
          coverageNote: assessment.coverageNote,
        };
      },
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }
}
