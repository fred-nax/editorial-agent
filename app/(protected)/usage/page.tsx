import type { Metadata } from "next";
import { UsagePageClient } from "@/components/usage/UsagePageClient";
import {
  getUsageSummary,
  listUsageHistory,
  resolveUsagePeriod,
} from "@/lib/openai-usage-aggregate";
import { resolveActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Consommation",
};

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const workspace = await resolveActiveWorkspace();
  const period = resolveUsagePeriod({ preset: "30d" });
  const filters = {
    workspaceId: workspace.id,
    from: period.from,
    to: period.to,
    operationType: "all" as const,
    model: "all" as const,
    status: "all" as const,
    completeness: "all" as const,
    page: 1,
    pageSize: 25,
  };

  const [summary, history] = await Promise.all([
    getUsageSummary(filters),
    listUsageHistory(filters),
  ]);

  return (
    <UsagePageClient
      workspaceName={workspace.name}
      initialPeriod={period.preset}
      initialSummary={summary}
      initialHistory={history}
    />
  );
}
