import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdtemp, rm, readFile, realpath, readdir } from "node:fs/promises";
import { join, resolve, relative, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const execute = promisify(execFile);
const executeGit=(root:string,args:string[])=>execute("git",["-c","core.hooksPath=/dev/null",...args],{cwd:root,timeout:12000,maxBuffer:4194304,env:{PATH:process.env.PATH??"/usr/bin:/bin",HOME:process.env.HOME??""}});
export async function git(root: string, ...args: string[]) {
  try{return (await executeGit(root,args)).stdout.trimEnd();}catch{throw new Error(`Git operation failed: ${args[0]}`);}
}
export async function cleanMaster(root: string, expected?: string) {
  if (await git(root, "symbolic-ref", "--short", "HEAD") !== "master") throw new Error("Runner requires master; no checkout was changed.");
  if (await git(root, "status", "--porcelain", "--untracked-files=all")) throw new Error("Checkout is dirty; runner will not stash or change session files.");
  const head = await git(root, "rev-parse", "master");
  if (expected && head !== expected) throw new Error("master advanced during build; candidate discarded.");
  return head;
}
export async function createTree(root: string, version: number, base: string) {
  if(!Number.isSafeInteger(version)||version<1)throw new Error("Invalid worktree version.");
  const parent = await mkdtemp(join(await realpath(tmpdir()),`${await treePrefix(root)}${version}-`)),path=join(parent,"tree");
  try{await git(root, "worktree", "add", "--detach", path, base);await validateTree(root,path,version);return path;}
  catch(error){await git(root,"worktree","remove","--force",path).catch(()=>{});await rm(parent,{recursive:true,force:true});throw error;}
}
const treePrefix=async(root:string)=>`world-build-${createHash("sha256").update(await realpath(root)).digest("hex").slice(0,16)}-v`;
/** Recovery/removal require this repository's canonical, registered, non-symlink tree. */
export async function validateTree(root:string,path:string,version?:number){
  if(path!==resolve(path))throw new Error("Invalid pending worktree recovery path.");
  const parent=dirname(path),prefix=await treePrefix(root),name=basename(parent);
  const suffix=name.startsWith(prefix)?/^(\d+)-[a-zA-Z0-9]{6}$/.exec(name.slice(prefix.length)):null;
  const temporary=basename(path)==="tree"&&dirname(parent)===await realpath(tmpdir())&&!!suffix&&(version===undefined||Number(suffix[1])===version);
  // Safely finish a recorded run from before the temporary-directory migration.
  const legacyVersion=/^v([1-9][0-9]*)$/.exec(basename(path));
  const legacy=!!legacyVersion&&parent===join(await realpath(root),"worktrees")&&(version===undefined||Number(legacyVersion[1])===version);
  if((!temporary&&!legacy)||await realpath(parent)!==parent||await realpath(path)!==path)throw new Error("Invalid pending worktree recovery path or symlink.");
  const registered=(await git(root,"worktree","list","--porcelain")).split("\n").includes(`worktree ${path}`);
  if(!registered)throw new Error("Pending worktree is not registered to this repository.");
  return temporary;
}
export async function removeTree(root: string, path: string) { const temporary=await validateTree(root,path);await git(root, "worktree", "remove", "--force", path);if(temporary)await rm(dirname(path),{recursive:true,force:true}); }
export async function commitTree(path: string, message: string) {
  await git(path, "add", "--", "world/modules");
  await git(path, "-c", "user.name=World Runner", "-c", "user.email=world@localhost", "commit", "--no-gpg-sign", "-m", message);
  return git(path, "rev-parse", "HEAD");
}
export async function promote(root: string, base: string, commit: string, tag: string) {
  await cleanMaster(root, base);
  if (await git(root, "tag", "--list", tag)) throw new Error("Version tag already exists.");
  await git(root, "tag", tag, commit);
  try{await cleanMaster(root,base);await git(root,"merge","--ff-only","--no-edit",commit);}
  catch(error){await discardUnshippedTag(root,tag,commit);throw error;}
}
/** Only the recorded reserved version may be removed, and never if master reaches it. */
export async function discardUnshippedTag(root:string,version:number|string,expectedCommit?:string){
  const ref=`refs/tags/${typeof version==="number"?`v${version}`:version}`;
  try{await executeGit(root,["merge-base","--is-ancestor",ref,"master"]);}
  catch(error){const code=(error as {code?:number}).code;
    if(code===1){await git(root,"update-ref","-d",ref,...(expectedCommit?[expectedCommit]:[]));return;}
    if(code===128)return; // Missing or unreadable ref is not proof of an unshipped commit.
    throw new Error("Git operation failed: merge-base");
  }
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
