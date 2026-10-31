import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, utimes, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { withCodexHome, runBounded, cleanupStaleCodexHomes, codexArgs } from "../server/runtime/process.js";
const env={PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"synthetic-private-token"};
test("supported runtime flags disable plugin sync, apps, hooks and host skill discovery for both lanes", async()=>{
 for(const sandbox of ["read-only","workspace-write"] as const){const args=await codexArgs(process.cwd(),sandbox,sandbox==="read-only"?"low":"medium");
  assert.deepEqual(args.slice(0,3),["--no-daemon","exec","--strict-config"]);
  for(const name of ["plugins","remote_plugin","plugin_discovery_prefetch","apps","skill_mcp_dependency_install","hooks"])assert.ok(args.some((v,i)=>v==="--disable"&&args[i+1]===name),name);
  assert.ok(args.some((v,i)=>v==="--enable"&&args[i+1]==="skip_host_skill_discovery"));
 }
});
test("normal CLI exit drains a background writer with ignored stdio before home removal",async()=>{
 const root=await mkdtemp(join(tmpdir(),"runtime-writer-"));let home="",pid=0;
 try{
 const verdict=await withCodexHome(root,env,async childEnv=>{
  home=childEnv.CODEX_HOME!;
  const writer=`const fs=require('fs'),p=require('path');const dir=p.join(process.env.CODEX_HOME,'.tmp','plugins-clone-test','skills');fs.mkdirSync(dir,{recursive:true});setInterval(()=>{fs.writeFileSync(p.join(dir,'late-'+Date.now()),'fixture')},2);process.send('ready');`;
  const leader=`const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(writer)}],{stdio:['ignore','ignore','ignore','ipc']});c.once('message',()=>{console.log(JSON.stringify({pid:c.pid}));process.exit(0)});`;
  const result=await runBounded({bin:process.execPath,args:["-e",leader],cwd:root,env:childEnv,timeoutMs:3000,maxBytes:8192});
  assert.equal(result.code,0);pid=(JSON.parse(result.output) as {pid:number}).pid;try { process.kill(pid,0); const status=execFileSync("ps",["-p",String(pid),"-o","stat="],{encoding:"utf8"}).trim();assert.match(status,/^Z/,"A surviving PID must be an exited zombie, never a writer"); } catch(error) { if((error as NodeJS.ErrnoException).code!=="ESRCH" && !(error as {status?:number}).status)throw error; }return "accept";
 });assert.equal(verdict,"accept");await assert.rejects(readFile(join(home,"config.toml")));assert.deepEqual(await readdir(join(root,".codex-runtime/runs")),[]);
 }finally{if(pid)try{process.kill(pid,"SIGKILL")}catch{}await rm(root,{recursive:true,force:true})}
});
test("late writer ENOTEMPTY retries preserve the verdict; persistent cleanup errors warn redacted and recover",async()=>{
 const root=await mkdtemp(join(tmpdir(),"runtime-cleanup-"));let calls=0,owned="";const warnings:string[]=[];
 try{
 const first=await withCodexHome(root,env,async e=>{owned=dirname(e.CODEX_HOME!);return "accept";},{remove:async(path,options)=>{calls++;if(calls===1){await mkdir(join(String(path),"late"),{recursive:true});await writeFile(join(String(path),"late/file"),"writer");throw Object.assign(new Error("late writer"),{code:"ENOTEMPTY"});}await rm(path,options);},warn:m=>warnings.push(m)});
 assert.equal(first,"accept");assert.equal(calls,2);assert.equal(warnings.length,0);
 const second=await withCodexHome(root,env,async e=>{owned=dirname(e.CODEX_HOME!);return "accept";},{remove:async()=>{throw Object.assign(new Error(env.AWS_BEARER_TOKEN_BEDROCK),{code:"EACCES"});},warn:m=>warnings.push(m)});
 assert.equal(second,"accept");assert.equal(warnings.length,1);assert.ok(!warnings[0]!.includes(env.AWS_BEARER_TOKEN_BEDROCK));assert.ok(warnings[0]!.includes("REDACTED"));
 assert.equal(JSON.parse(await readFile(join(owned,".owner.json"),"utf8")).active,false);await cleanupStaleCodexHomes(root,env);await assert.rejects(readFile(join(owned,".owner.json")));
 }finally{await rm(root,{recursive:true,force:true})}
});
test("startup removes stale and legacy homes, preserves live invocations and unrelated directories",async()=>{
 const root=await mkdtemp(join(tmpdir(),"runtime-recover-")),runs=join(root,".codex-runtime/runs");
 try{for(const name of ["invocation-stale","invocation-live","invocation-legacy","unrelated"])await mkdir(join(runs,name),{recursive:true});
 await writeFile(join(runs,"invocation-stale/.owner.json"),JSON.stringify({owner:99999999,active:true}));await writeFile(join(runs,"invocation-live/.owner.json"),JSON.stringify({owner:process.pid,active:true}));const old=new Date(Date.now()-300000);await utimes(join(runs,"invocation-legacy"),old,old);
 await cleanupStaleCodexHomes(root,env);assert.deepEqual((await readdir(runs)).sort(),["invocation-live","unrelated"]);
 }finally{await rm(root,{recursive:true,force:true})}
});
