import {chromium,type Browser,type BrowserContext,type BrowserServer} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:net';
import type {WorldLook} from '../../world/engine/render-profile.js';
export const GATE_BROWSER_STARTUP_MS=10_000;

/** Server-owned Chromium profile and caches. Each candidate still gets a fresh page/world. */
export class GateBrowser {
 private endpoint='';private port=0;private server:BrowserServer|undefined;private browser:Browser|undefined;private context:BrowserContext|undefined;
 private starting:Promise<void>|undefined;private closing=false;warmupMs=0;
 async prepare(_look:WorldLook='new'){
  if(this.closing)throw new Error('Gate browser is closing.');
  if(this.browser&&!this.browser.isConnected())await this.reset();
  await (this.starting??=this.start().catch(async error=>{await this.reset();throw error;}));
  if(this.closing||!this.browser?.isConnected())throw new Error('Gate browser disconnected.');
  return {endpoint:this.endpoint,port:this.port,warmupMs:this.warmupMs};
 }
 private async start(){
  const started=performance.now(),socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));this.port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
  this.server=await chromium.launchServer({timeout:GATE_BROWSER_STARTUP_MS,headless:true,env:{PATH:process.env.PATH??'/usr/bin:/bin',HOME:process.env.HOME??''},args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0']});
  const profile=this.server.process().spawnargs.find(arg=>arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);if(!profile)throw new Error('Gate browser profile is unavailable.');
  const [port,path]=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');this.endpoint=`ws://127.0.0.1:${port}${path}`;
  this.browser=await chromium.connectOverCDP(this.endpoint);this.context=this.browser.contexts()[0];if(!this.context)throw new Error('Gate browser context is unavailable.');this.warmupMs=performance.now()-started;
 }
 async release(){
  if(!this.browser?.isConnected())return;let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([(async()=>{const session=await this.browser!.newBrowserCDPSession();try{const {targetInfos}=await session.send('Target.getTargets');await Promise.all(targetInfos.filter(t=>t.type==='page').map(t=>session.send('Target.closeTarget',{targetId:t.targetId})));}finally{await session.detach();}})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Gate page cleanup timed out.')),2000);})]);}
  catch{await this.reset();}finally{clearTimeout(timer);}
 }
 async reset(){
  const server=this.server;this.server=undefined;this.browser=undefined;this.context=undefined;this.starting=undefined;
  if(server)await server.kill().catch(()=>{});
 }
 async close(){this.closing=true;await this.starting?.catch(()=>{});await this.reset();}
}
