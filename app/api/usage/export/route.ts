import { requireAuth } from "@/lib/require-auth";
import {
  isOpenAiUsageOperationType,
  listUsageHistory,
  resolveUsagePeriod,
} from "@/lib/openai-usage-aggregate";
import { buildUsageCsv } from "@/lib/openai-usage-csv";
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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
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
        : "all";

    const history = await listUsageHistory({
      workspaceId: workspace.id,
      from: period.from,
      to: period.to,
      operationType,
      model: url.searchParams.get("model")?.trim() || "all",
      status: url.searchParams.get("status")?.trim() || "all",
      completeness: parseCompleteness(url.searchParams.get("completeness")),
      page: 1,
      pageSize: 5000,
    });

    const csv = buildUsageCsv(history.rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="naxialis-openai-usage-${workspace.id}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return new Response(
        JSON.stringify({ error: error.message, code: error.code }),
        {
          status: error.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    throw error;
  }
}
