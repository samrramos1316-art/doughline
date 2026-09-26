// Shared helper for test scripts that need a real running `next dev` server
// (to exercise actual route handlers, not just Supabase directly).
import { spawn, execSync } from "node:child_process";

// Pass { pipeOutput: true } to read the server's stdout/stderr (e.g. to
// capture server-side debug logs); otherwise it's discarded.
export function startDevServer(port, { pipeOutput = false } = {}) {
  // shell: true is required for npx to resolve on Windows; args are fixed
  // constants, not user input, so shell-injection risk doesn't apply.
  return spawn("npx", ["next", "dev", "--port", String(port)], {
    cwd: process.cwd(),
    shell: true,
    stdio: pipeOutput ? ["ignore", "pipe", "pipe"] : "ignore",
  });
}

export async function waitForServer(baseUrl, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(baseUrl);
      if (res.status) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not become ready within ${timeoutMs}ms`);
}

// child.kill() only kills the shell wrapper spawned by shell: true, not the
// `next dev` process tree underneath it, leaving an orphaned server bound to
// the port. On Windows, taskkill /t kills the whole tree.
export function killDevServer(devServer) {
  if (!devServer || !devServer.pid) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${devServer.pid} /t /f`, { stdio: "ignore" });
    } catch {
      // already exited
    }
  } else {
    devServer.kill();
  }
}
