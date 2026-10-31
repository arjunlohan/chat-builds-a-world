import { spawn } from "node:child_process";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
export interface CheckResult { ok: boolean; reason?: string; fps?: number; avgFps?: number; samples?: number; durationMs?: number }
export async function candidateCheck(root: string, modules: { id: string; file: string; code: string }[], probeId: string, signal: AbortSignal): Promise<CheckResult> {
  const started = performance.now(), directory = join(root, "state/checks"); await mkdir(directory, { recursive: true });
  const input = join(directory, `${randomUUID()}.json`); await writeFile(input, JSON.stringify({ modules, probeId }), { mode: 0o600 });
  try {
    return await new Promise(resolveCheck => {
      const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../../checks/candidate.worker.ts", import.meta.url)), input], { cwd: resolve(fileURLToPath(new URL("../..", import.meta.url))), detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "" } });
      let done = false, output = "", bytes = 0, browserPid = 0;
      const kill = () => { for (const pid of [browserPid, child.pid]) if (pid) try { process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL"); } catch {} };
      const finish = (result: CheckResult, force = false) => {
        if (done) return; done = true; clearTimeout(timer); signal.removeEventListener("abort", abort); if (force) kill();
        resolveCheck({ ...result, durationMs: Math.round(performance.now() - started) });
      };
      const abort = () => finish({ ok: false, reason: "Candidate check cancelled." }, true);
      const timer = setTimeout(() => finish({ ok: false, reason: "Candidate exceeded its 25-second external watchdog." }, true), 24_000);
      signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk; bytes += Buffer.byteLength(chunk);
        if (bytes > 65536) { finish({ ok: false, reason: "Candidate check output exceeded its limit." }, true); return; }
        for (const line of output.split("\n")) try { const event = JSON.parse(line) as { browserPid?: number }; if (Number.isSafeInteger(event.browserPid)) browserPid = event.browserPid!; } catch {}
      });
      child.stderr.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 65536) finish({ ok: false, reason: "Candidate check output exceeded its limit." }, true); });
      child.once("error", () => finish({ ok: false, reason: "Candidate checker could not start." }, true));
      child.once("close", code => {
        let result: CheckResult = { ok: false, reason: "Candidate checker failed." };
        try { result = JSON.parse(output.trim().split("\n").at(-1)!) as CheckResult; } catch {}
        if (code !== 0 && result.ok) result = { ok: false, reason: "Candidate checker failed." };
        finish(result);
      });
    });
  } finally { await rm(input, { force: true }); }
}
