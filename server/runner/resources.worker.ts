import {createServer} from "node:http";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {chromium} from "@playwright/test";
import type {ResourceContext,SelfCheckResult} from "./self-check.js";
let text="";for await(const chunk of process.stdin)text+=String(chunk);
const input=JSON.parse(text) as ResourceContext&{modules:ResourceContext["retained"]};
const bundled=await build({entryPoints:[fileURLToPath(new URL("./resource-probe.ts",import.meta.url))],bundle:true,format:"esm",platform:"browser",write:false,plugins:[{name:"shared-three",setup(b){b.onResolve({filter:/^three$/},()=>({path:"/assets/three.js",external:true}));}}]});
const three=await build({stdin:{contents:'export * from "three";',resolveDir:fileURLToPath(new URL("../..",import.meta.url))},bundle:true,format:"esm",platform:"browser",write:false});
const server=createServer((request,response)=>{
 response.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'");
 const path=request.url??"",index=/^\/modules\/(\d+)\.js$/.exec(path);
 if(path==="/"){response.setHeader("Content-Type","text/html");response.end('<!doctype html><script type="module" src="/probe.js"></script>');}
 else if(path==="/input.json"){response.setHeader("Content-Type","application/json");response.end(text);}
 else if(path==="/probe.js"||path==="/assets/three.js"||index&&input.modules[Number(index[1])]){response.setHeader("Content-Type","text/javascript");response.end(path==="/probe.js"?bundled.outputFiles[0]!.text:path==="/assets/three.js"?three.outputFiles[0]!.text:input.modules[Number(index![1])]!.code);}
 else if(path==="/favicon.ico"){response.writeHead(204).end();}else response.writeHead(404).end();
});
let browserServer:Awaited<ReturnType<typeof chromium.launchServer>>|undefined,browser:Awaited<ReturnType<typeof chromium.connect>>|undefined;
try{
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 // Resource admission only: no WebGL context, rendering, visibility or FPS sampling.
 browserServer=await chromium.launchServer({headless:true,args:["--disable-gpu","--disable-webgl"]});console.log(JSON.stringify({browserPid:browserServer.process().pid}));
 browser=await chromium.connect(browserServer.wsEndpoint());const page=await browser.newPage();let error="";page.on("pageerror",e=>error=e.message.slice(0,300));
 await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}`);await page.waitForFunction(()=>!!window.__resourceResult,undefined,{timeout:8000}).catch(()=>{throw new Error(error||"Resource probe did not finish.");});
 const result=await page.evaluate(()=>window.__resourceResult);console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}catch(error){console.log(JSON.stringify({ok:false,reason:error instanceof Error?error.message:"Resource checker failed"} satisfies SelfCheckResult));process.exitCode=1;}
finally{await browser?.close();await browserServer?.close();await new Promise<void>(r=>server.close(()=>r()));}
