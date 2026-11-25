import type { Metadata } from "next";
import { OpportunitiesBoard } from "@/components/OpportunitiesBoard";
import { WorkspaceEmptyState } from "@/components/workspace/WorkspaceEmptyState";
import {
  assertModuleAllowedForWorkspace,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Opportunités SEO",
};

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const workspace = await resolveActiveWorkspace();

  try {
    assertModuleAllowedForWorkspace(workspace, "opportunities");
  } catch (error) {
    if (
      error instanceof WorkspaceContextError &&
      error.code === "WORKSPACE_OPERATION_FORBIDDEN"
    ) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Opportunités SEO
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Espace {workspace.name} — thématiques et opportunités isolées.
            </p>
          </div>
          <WorkspaceEmptyState module="opportunities" />
        </div>
      );
    }
    throw error;
  }

  return <OpportunitiesBoard />;
}
