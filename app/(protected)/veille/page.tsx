import type { Metadata } from "next";
import { EditorialWatch } from "@/components/EditorialWatch";
import { WorkspaceEmptyState } from "@/components/workspace/WorkspaceEmptyState";
import {
  assertModuleAllowedForWorkspace,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Veille éditoriale",
};

export const dynamic = "force-dynamic";

export default async function VeillePage() {
  const workspace = await resolveActiveWorkspace();

  try {
    assertModuleAllowedForWorkspace(workspace, "veille");
  } catch (error) {
    if (
      error instanceof WorkspaceContextError &&
      error.code === "WORKSPACE_OPERATION_FORBIDDEN"
    ) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Veille éditoriale
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Espace {workspace.name}
            </p>
          </div>
          <WorkspaceEmptyState module="veille" />
        </div>
      );
    }
    throw error;
  }

  return <EditorialWatch />;
}
