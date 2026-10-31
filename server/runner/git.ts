import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, readFile, realpath, readdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
const execute = promisify(execFile);
export async function git(root: string, ...args: string[]) {
  try { return (await execute("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root, timeout: 12_000, maxBuffer: 4_194_304, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "" } })).stdout.trimEnd(); }
  catch { throw new Error(`Git operation failed: ${args[0]}`); }
}
export async function cleanMaster(root: string, expected?: string) {
  if (await git(root, "symbolic-ref", "--short", "HEAD") !== "master") throw new Error("Runner requires master; no checkout was changed.");
  if (await git(root, "status", "--porcelain", "--untracked-files=all")) throw new Error("Checkout is dirty; runner will not stash or change session files.");
  const head = await git(root, "rev-parse", "master");
  if (expected && head !== expected) throw new Error("master advanced during build; candidate discarded.");
  return head;
}
export async function createTree(root: string, version: number, base: string) {
  const parent = join(root, "worktrees"); await mkdir(parent, { recursive: true });
  if (await realpath(parent) !== join(await realpath(root), "worktrees")) throw new Error("Worktree directory cannot be a symlink.");
  const path = join(parent, `v${version}`);
  await git(root, "worktree", "add", "--detach", path, base); return path;
}
export async function removeTree(root: string, path: string) { await git(root, "worktree", "remove", "--force", path); }
export async function commitTree(path: string, message: string) {
  await git(path, "add", "--", "world/modules");
  await git(path, "-c", "user.name=World Runner", "-c", "user.email=world@localhost", "commit", "--no-gpg-sign", "-m", message);
  return git(path, "rev-parse", "HEAD");
}
export async function promote(root: string, base: string, commit: string, tag: string) {
  await cleanMaster(root, base);
  if (await git(root, "tag", "--list", tag)) throw new Error("Version tag already exists.");
  await git(root, "merge", "--ff-only", "--no-edit", commit);
  await git(root, "tag", tag, commit);
}
/** Snapshot includes ignored files, so hiding an engine edit behind .gitignore cannot pass. */
export async function inventory(root: string) {
  const files = new Map<string, string>();
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name), name = relative(root, path).split("\\").join("/");
      if (name === ".git") continue;
      if (entry.isSymbolicLink()) throw new Error("Symlinks are forbidden in candidate trees.");
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const stat = await lstat(path); if (stat.nlink > 1) throw new Error("Hard-linked files are forbidden."); if (stat.size > 2_097_152) throw new Error("Candidate file exceeds 2 MiB.");
        const { createHash } = await import("node:crypto");
        files.set(name, `${stat.mode & 0o777}:${createHash("sha256").update(await readFile(path)).digest("hex")}`);
      } else throw new Error("Unsupported candidate filesystem entry.");
    }
  }
  await walk(root); return files;
}
export async function auditDiff(tree: string, base: string, before: Map<string, string>, allowed: readonly string[]) {
  if (await git(tree, "rev-parse", "HEAD") !== base) throw new Error("Builder changed Git history.");
  const after = await inventory(tree), touched: string[] = [];
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(name) === after.get(name)) continue;
    if (!name.startsWith("world/modules/") || !allowed.includes(name) || !name.endsWith(".ts")) throw new Error(`Diff outside approved module files: ${name.slice(0, 120)}`);
    if (!after.has(name)) throw new Error("Module deletions are forbidden.");
    if (before.has(name) && before.get(name)!.split(":")[0] !== after.get(name)!.split(":")[0]) throw new Error("File mode changes are forbidden.");
    if ((Number(after.get(name)!.split(":")[0]) & 0o111) !== 0) throw new Error("Executable module files are forbidden.");
    touched.push(name);
  }
  if (!touched.length) throw new Error("Builder produced no module changes.");
  const status = await git(tree, "diff", "--name-status", "--find-renames", base);
  if (status.split("\n").some(line => /^[RDCUT]/.test(line))) throw new Error("Renames, deletions and type changes are forbidden.");
  return touched;
}
