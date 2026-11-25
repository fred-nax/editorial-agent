import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  getUsageSummary,
  isOpenAiUsageOperationType,
  listUsageHistory,
  resolveUsagePeriod,
} from "@/lib/openai-usage-aggregate";
import type { OpenAiUsageCompleteness } from "@/lib/openai-usage-tracker";
import {
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCompleteness(
  value: string | null
): OpenAiUsageCompleteness | "all" {
  if (
    value === "complete" ||
    value === "partial" ||
    value === "unknown" ||
    value === "zero"
  ) {
    return value;
  }
  return "all";
}

export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspace = await resolveActiveWorkspace();
    const url = new URL(request.url);
    const period = resolveUsagePeriod({
      preset: url.searchParams.get("period"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    const operationRaw = url.searchParams.get("operationType");
    const operationType =
      operationRaw && isOpenAiUsageOperationType(operationRaw)
        ? operationRaw
        : ("all" as const);
    const model = url.searchParams.get("model")?.trim() || "all";
    const status = url.searchParams.get("status")?.trim() || "all";
    const completeness = parseCompleteness(url.searchParams.get("completeness"));
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "25");

    const filters = {
      workspaceId: workspace.id,
      from: period.from,
      to: period.to,
      operationType,
      model,
      status,
      completeness,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 25,
    } as const;

    const [summary, history] = await Promise.all([
      getUsageSummary(filters),
      listUsageHistory(filters),
    ]);

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        cmsProvider: workspace.cmsProvider,
      },
      period: {
        preset: period.preset,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
      },
      summary,
      history,
      note: "Montants estimés localement — jamais présentés comme facturés OpenAI.",
    });
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
