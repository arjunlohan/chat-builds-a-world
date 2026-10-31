import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, chmod, rm, readdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { git } from "../server/runner/git.js";
import { Runner, type RunResult } from "../server/runner/index.js";
import { Versions } from "../server/versions/index.js";
import { IdeaGuard } from "../server/guard/index.js";
import { WorldPipeline } from "../server/pipeline.js";
import { Rounds } from "../server/rounds/index.js";
import { createWorldServer } from "../server/http.js";
const source = process.cwd(), ownHead = await git(source, "rev-parse", "HEAD"), ownStatus = await git(source, "status", "--porcelain", "--untracked-files=all");
const root = await mkdtemp(join(tmpdir(), "world-runner-sim-"));
const names = (await git(source, "ls-files", "-z", "--cached", "--others", "--exclude-standard")).split("\0").filter(Boolean);
const ownHashes = await Promise.all(names.map(async name => createHash("sha256").update(await readFile(join(source, name))).digest("hex")));
for (const name of names) { await mkdir(dirname(join(root, name)), { recursive: true }); await copyFile(join(source, name), join(root, name)); }
await git(root, "init", "-b", "master"); await git(root, "add", "."); await git(root, "-c", "user.name=Simulation", "-c", "user.email=simulation@localhost", "commit", "--no-gpg-sign", "-m", "Isolated simulation baseline");
let now = Date.now();
const pipeline = new WorldPipeline(() => now), versions = new Versions(root, version => pipeline.publish({ type: "version", version })); await versions.init();
const env = { PATH: process.env.PATH!, HOME: process.env.HOME!, AWS_BEARER_TOKEN_BEDROCK: "offline-fixture-not-a-key", TWITCH_ACCESS_TOKEN: "must-not-inherit" };
const guard = new IdeaGuard({ root, bin: resolve(source, "checks/fixtures/fake-codex.cjs"), env });
let job: Promise<RunResult> | undefined, lastResult: RunResult | undefined;
const announcements: string[] = [];
const runner = new Runner({ root, versions, env, bin: resolve(source, "checks/fixtures/fake-builder.cjs"), timeoutMs: 60_000,
  feed: (kind, text) => rounds.feed(kind, text), announce: async text => { announcements.push(text); } });
const timeoutRunner = new Runner({ root, versions, env, bin: resolve(source, "checks/fixtures/fake-builder.cjs"), timeoutMs: 500, feed: (kind,text) => rounds.feed(kind,text), announce: async text => { announcements.push(text); } });
const rounds = new Rounds({ now: () => now, publish: state => pipeline.publish({ type: "rounds", state }),
  review: async (idea, context) => ({ ...await guard.review(idea, context.signal), mode: "fixture" }), canRollback: () => versions.history.length > 1,
  build: request => job = (request.decision.spec?.description === "timeout" ? timeoutRunner : runner).build(request).then(result => lastResult = result),
  rollback: requester => job = runner.rollback(requester).then(result => lastResult = result),
});
pipeline.attachRounds(rounds);
let lastReal = Date.now(); const clock = setInterval(() => { const real = Date.now(); now += real - lastReal; lastReal = real; rounds.tick(); }, 50);
for (let i=0;i<80;i++) pipeline.roster.accept({ id:`seed-${i}`,userId:`sim-${i}`,displayName:`Neighbor${i}`,color:"#79D7CF",text:"hello",timestamp:now },now);
const app = await createWorldServer(pipeline, undefined, rounds, versions); await new Promise<void>(r => app.server.listen(0,"127.0.0.1",r));
const port = (app.server.address() as {port:number}).port;
const browser = await chromium.launch({ headless:true, args: process.platform === "darwin" ? ["--use-angle=metal","--enable-gpu"] : ["--enable-gpu"] });
const results: { round:number; verdict:string; outcome:string; durationMs:number; reason:string; tag?:string; check?:unknown }[]=[];
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}}), errors:string[]=[]; let navigations=0;
 page.on("framenavigated",f=>{if(f===page.mainFrame())navigations++});page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text())});
 await page.goto(`http://127.0.0.1:${port}/world?overlay=1`); await page.waitForSelector('canvas[data-ready="true"]');
 await page.evaluate(() => { const frame=document.createElement("iframe");frame.id="runner-overlay";frame.src="/overlay";Object.assign(frame.style,{position:"fixed",inset:"0",width:"1920px",height:"1080px",border:"0",pointerEvents:"none",zIndex:"20"});document.body.append(frame); });
 const overlay=(await(await page.waitForSelector("#runner-overlay")).contentFrame())!;await overlay.waitForSelector(".connection.connected",{state:"attached"});
 const post = async (user:string,text:string) => {
  now+=300; const response=await fetch(`http://127.0.0.1:${port}/sim/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:`case-${now}`,userId:user,displayName:user,color:"#79D7CF",text})});
  assert.equal((await response.json() as {accepted:boolean}).accepted,true,text);
 };
 const kinds=["guard-reject","outside","throws","slow","empty","good","timeout","good","rollback","good"];
 for(let i=0;i<kinds.length;i++) {
  const start=performance.now(), kind=kinds[i]!, requester=`Viewer${i+1}`; job=undefined; lastResult=undefined;
  if(kind==="rollback") {
   await post(requester,"!rollback"); await post("VoterA","!vote yes");await post("VoterB","!vote no");await post("VoterB","!vote yes");
   assert.equal(rounds.snapshot().rollback?.yes,2);now+=30_000;rounds.tick();
  } else {
   await post(requester,`!idea runner:${kind}:round${i+1}`);now+=120_000;rounds.tick();await post("Voter","!vote 1");now+=45_000;rounds.tick();
   for(let poll=0;poll<100&&rounds.snapshot().phase==="guarding";poll++)await new Promise(r=>setTimeout(r,25));
  }
  if (kind === "good" && job) {
   await overlay.waitForFunction(() => document.querySelector(".feed-lines")?.textContent?.includes("SwiftShader"), undefined, { timeout: 10_000 });
   assert.ok(!(await overlay.locator(".feed-lines").textContent())?.includes('"type":'));
   if (i === 5) { await mkdir(join(source,"test-results"),{recursive:true}); await page.screenshot({path:join(source,"test-results/runner-building-overlay.png")}); }
  }
  if(job) await job;
  await new Promise(r=>setImmediate(r));
  const result=lastResult as RunResult|undefined;
  const row={round:i+1,verdict:kind==="rollback"?"vote 2-0":kind==="guard-reject"?"reject":"accept",outcome:kind==="guard-reject"?"GUARD REJECT":result?.outcome??"MISSING",durationMs:Math.round(performance.now()-start),reason:result?.reason??rounds.snapshot().guard.reason,tokens:result?.tokens??{input:null,output:null,total:null},...(result?.tag?{tag:result.tag}:{}),...(result?.check?{check:result.check}:{})};
  results.push(row);console.log(JSON.stringify(row));
  if(["good","rollback"].includes(kind)) {
   assert.equal(result?.ok,true,row.reason); assert.ok(versions.current);
   await page.waitForFunction(version=>window.__worldStats.moduleVersion===version,versions.current!.version);
   assert.equal(await page.evaluate(()=>window.__worldStats.moduleError),"");
  } else if(kind!=="guard-reject") {
   assert.equal(result?.ok,false);
   const expected: Record<string,RegExp>={outside:/outside approved/,throws:/update threw/,slow:/overruns/,empty:/draws nothing/,timeout:/timed out|cancelled/};
   assert.match(row.reason,expected[kind]!);
  }
  assert.equal((await readdir(join(root,"worktrees")).catch(()=>[])).length,0,"Worktree leaked");
  assert.equal(await git(root,"status","--porcelain","--untracked-files=all"),"");
 }
 assert.equal(versions.current?.version,4);assert.equal(navigations,1,"Hot swap reloaded the page");assert.deepEqual(errors,[]);
 assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);
 assert.deepEqual(await Promise.all(names.map(async name => createHash("sha256").update(await readFile(join(source,name))).digest("hex"))),ownHashes);
 assert.equal(await git(source,"rev-parse","HEAD"),ownHead);assert.equal(await git(source,"status","--porcelain","--untracked-files=all"),ownStatus);
 await mkdir(join(source,"test-results"),{recursive:true});await page.screenshot({path:join(source,"test-results/runner-ten-rounds.png")});
 await mkdir(join(source,"state"),{recursive:true});await copyFile(join(root,"state/runner-metrics.jsonl"),join(source,"state/runner-sim-metrics.jsonl"));await writeFile(join(source,"state/runner-sim-results.json"),JSON.stringify({results,navigations,announcements,consoleErrors:errors.length,ownCheckoutUntouched:true},null,2));
 console.log(`10 rounds passed; ${announcements.length} chat announcements; one navigation; no leaked worktrees; original checkout untouched.`);
} finally {
 clearInterval(clock); rounds.dispose();versions.close();await browser.close();app.closeStreams();await new Promise<void>(r=>app.server.close(()=>r()));await rm(root,{recursive:true,force:true});
}
