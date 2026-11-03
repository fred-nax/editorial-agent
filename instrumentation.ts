export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  if (process.env.AUTH_SECRET === "build-placeholder") {
    return;
  }

  const { registerServerBoot } = await import("./lib/boot");
  await registerServerBoot();
}
