import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, utimes, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { withCodexHome, runBounded, cleanupStaleCodexHomes, codexArgs } from "../server/runtime/process.js";
const env={PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"synthetic-private-token"};
test("runtime argv uses discovery policy from its single copied config", async()=>{
 const config=await readFile(".codex-runtime/config.toml","utf8");
 for(const sandbox of ["read-only","workspace-write"] as const){const args=codexArgs(config,sandbox,sandbox==="read-only"?"low":"medium");
  assert.deepEqual(args.slice(0,3),["--no-daemon","exec","--strict-config"]);assert.ok(args.includes("--disable"));
  for(const feature of ["plugins","remote_plugin","plugin_discovery_prefetch","apps","skill_mcp_dependency_install","hooks"])assert.ok(config.includes(`${feature} = false`));
  assert.ok(config.includes("skip_host_skill_discovery = true"));
 }
});
test("normal CLI exit drains a background writer with ignored stdio before home removal",async()=>{
 const root=await mkdtemp(join(tmpdir(),"runtime-writer-"));let home="",pid=0;
 try{
 const verdict=await withCodexHome(root,env,async (childEnv,runtime)=>{
  home=childEnv.CODEX_HOME!;
  const writer=`const fs=require('fs'),p=require('path');const dir=p.join(process.env.CODEX_HOME,'.tmp','plugins-clone-test','skills');fs.mkdirSync(dir,{recursive:true});setInterval(()=>{fs.writeFileSync(p.join(dir,'late-'+Date.now()),'fixture')},2);process.send('ready');`;
  const leader=`const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(writer)}],{stdio:['ignore','ignore','ignore','ipc']});c.once('message',()=>{console.log(JSON.stringify({pid:c.pid}));process.exit(0)});`;
  const result=await runBounded({bin:process.execPath,onSpawn:runtime.onSpawn,args:["-e",leader],cwd:root,env:childEnv,timeoutMs:3000,maxBytes:8192});
  assert.equal(result.code,0);pid=(JSON.parse(result.output) as {pid:number}).pid;try { process.kill(pid,0); const status=execFileSync("ps",["-p",String(pid),"-o","stat="],{encoding:"utf8"}).trim();assert.match(status,/^Z/,"A surviving PID must be an exited zombie, never a writer"); } catch(error) { if((error as NodeJS.ErrnoException).code!=="ESRCH" && !(error as {status?:number}).status)throw error; }return "accept";
 });assert.equal(verdict,"accept");await assert.rejects(readFile(join(home,"config.toml")));assert.deepEqual(await readdir(join(root,".codex-runtime/runs")),[]);
 }finally{if(pid)try{process.kill(pid,"SIGKILL")}catch{}await rm(root,{recursive:true,force:true})}
});
test("a late cleanup failure is nonfatal, redacted, and attempted only once",async()=>{
 const root=await mkdtemp(join(tmpdir(),"runtime-cleanup-"));let calls=0;const warnings:string[]=[];
 try{
 const verdict=await withCodexHome(root,env,async()=>"accept",{remove:async(path)=>{calls++;await mkdir(join(String(path),"late"),{recursive:true});await writeFile(join(String(path),"late/file"),"writer");throw Object.assign(new Error(env.AWS_BEARER_TOKEN_BEDROCK),{code:"ENOTEMPTY"});},warn:m=>warnings.push(m)});
 assert.equal(verdict,"accept");assert.equal(calls,1);assert.equal(warnings.length,1);assert.ok(!warnings[0]!.includes(env.AWS_BEARER_TOKEN_BEDROCK));assert.ok(warnings[0]!.includes("REDACTED"));
 }finally{await rm(root,{recursive:true,force:true})}
});
test("process output redacts split-chunk secrets before callbacks and collection",async()=>{
 const lines:string[]=[];
 const raw=await runBounded({bin:process.execPath,args:["-e",`process.stdout.write('prefix synthetic-');setTimeout(()=>process.stdout.write('private-token suffix\\n'),10)`],env,cwd:process.cwd(),timeoutMs:1000,maxBytes:1024,onLine:line=>lines.push(line)});
 assert.equal(raw.code,0);assert.equal(raw.output,"prefix [REDACTED] suffix\n");assert.deepEqual(lines,["prefix [REDACTED] suffix"]);
});
test("startup removes stale and legacy homes, preserves live invocations and unrelated directories",async()=>{
 const root=await mkdtemp(join(tmpdir(),"runtime-recover-")),runs=join(root,".codex-runtime/runs");
 try{for(const name of ["invocation-stale","invocation-live","invocation-legacy","unrelated"])await mkdir(join(runs,name),{recursive:true});
 await writeFile(join(runs,"invocation-stale/.owner.json"),JSON.stringify({owner:99999999}));await writeFile(join(runs,"invocation-live/.owner.json"),JSON.stringify({owner:process.pid}));const old=new Date(Date.now()-300000);await utimes(join(runs,"invocation-legacy"),old,old);
 assert.equal(cleanupStaleCodexHomes(root,env),cleanupStaleCodexHomes(root,env));await cleanupStaleCodexHomes(root,env);assert.deepEqual((await readdir(runs)).sort(),["invocation-live","unrelated"]);
 }finally{await rm(root,{recursive:true,force:true})}
});

test("missing config cannot remove runtime plugin, hooks or discovery controls",()=>{
 const args=codexArgs("","read-only","low");for(const name of ["plugins","remote_plugin","plugin_discovery_prefetch","apps","skill_mcp_dependency_install","hooks"])assert.ok(args.some((arg,i)=>arg==="--disable"&&args[i+1]===name));assert.ok(args.includes("skip_host_skill_discovery"));
});
