const SECRET_PATTERN =
  /password|secret|authorization|api[_-]?key|database_url|hash|credential|(^|_)(access_)?token$/i;

function sanitize(
  fields?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!fields) {
    return undefined;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_PATTERN.test(key)) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || value === null) {
      clean[key] = value;
    } else if (typeof value === "boolean") {
      clean[key] = value;
    }
  }
  return clean;
}

function write(
  level: "info" | "error",
  scope: string,
  event: string,
  fields?: Record<string, unknown>
): void {
  const payload = {
    level,
    scope,
    event,
    ts: new Date().toISOString(),
    ...sanitize(fields),
  };
  const line = `[${scope}] ${event}`;
  if (level === "error") {
    console.error(line, payload);
  } else {
    console.info(line, payload);
  }
}

export function logInfo(
  scope: string,
  event: string,
  fields?: Record<string, unknown>
): void {
  write("info", scope, event, fields);
}

export function logError(
  scope: string,
  event: string,
  fields?: Record<string, unknown>
): void {
  write("error", scope, event, fields);
}
