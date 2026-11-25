export type WorkspaceCmsProviderView = "wordpress" | "webflow";

export type WorkspaceView = {
  id: string;
  slug: string;
  name: string;
  cmsProvider: WorkspaceCmsProviderView;
  siteUrl: string | null;
  siteLabel: string | null;
  defaultLanguage: string;
  enabled: boolean;
};

export type WorkspaceBootstrap = {
  workspaces: WorkspaceView[];
  active: WorkspaceView;
};
