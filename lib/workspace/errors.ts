export class WorkspaceContextError extends Error {
  readonly code:
    | "WORKSPACE_REQUIRED"
    | "WORKSPACE_NOT_FOUND"
    | "WORKSPACE_DISABLED"
    | "WORKSPACE_MISMATCH"
    | "WORKSPACE_CMS_MISMATCH"
    | "WORKSPACE_OPERATION_FORBIDDEN";

  readonly status: number;

  constructor(
    code: WorkspaceContextError["code"],
    message: string,
    status = 400
  ) {
    super(message);
    this.name = "WorkspaceContextError";
    this.code = code;
    this.status = status;
  }
}
