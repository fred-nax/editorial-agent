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

function topicStore(): TopicStore {
  return {
    async findExactSource(sourceUrl, subject) {
      const found = await db.topic.findFirst({
        where: {
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

  const topics = await db.topic.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ topics });
}

export async function POST(request: Request) {
  const session = await requireAuth();
  const result = await handleCreateTopic(request, {
    authenticated: Boolean(session?.user),
    store: topicStore(),
    assess: async (input) => {
      const assessment = await assessVeilleProposal(input);
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
}
