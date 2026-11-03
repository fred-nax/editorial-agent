import { spawn } from "node:child_process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_PATH: [
          "/usr/local/lib/node_modules/prisma/node_modules",
          "/usr/local/lib/node_modules",
          process.env.NODE_PATH,
        ]
          .filter(Boolean)
          .join(":"),
      },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });
}

function bootLog(event) {
  console.info(`[boot] ${event}`, {
    level: "info",
    scope: "boot",
    event,
    ts: new Date().toISOString(),
  });
}

bootLog("migrate");
await run("prisma", ["migrate", "deploy"]);
bootLog("start");
await run("node", ["server.js"]);
