export type { WorkspaceView, WorkspaceBootstrap } from "./types";
export {
  WorkspaceProvider,
  useWorkspace,
  useWorkspaceOptional,
} from "./WorkspaceProvider";
export { WorkspaceSelector } from "./WorkspaceSelector";
export { ActiveWorkspaceIndicator } from "./ActiveWorkspaceIndicator";
export { CmsProviderIcon, cmsIconSrc } from "./CmsProviderIcon";
// WorkspaceEmptyState : import depuis ./WorkspaceEmptyState (RSC) pour éviter
// de tirer lib/workspace dans le graphe client via ce barrel.
