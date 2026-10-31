import {cleanupStaleCodexHomes,protectedValues,redact} from "./runtime/process.js";
import {acquireLock} from "./runtime/lock.js";
import {Checkpoint} from "./persistence/checkpoint.js";
import {simulationAdapters} from "./sim/adapters.js";
import {bedrockProvider} from "./summon/provider.js";
import {Runner} from "./runner/index.js";
import {Versions} from "./versions/index.js";
import {IdeaGuard} from "./guard/index.js";
import {Rounds,DEMO_MS} from "./rounds/index.js";
import {readConfig} from "./config.js";
import {createWorldServer} from "./http.js";
import {WorldPipeline} from "./pipeline.js";
import {SummonService} from "./summon/index.js";
import {connectTwitch} from "./twitch/index.js";
import {join} from "node:path";
async function start(){
 const config=readConfig(),root=process.cwd(),release=await acquireLock(root,"server");
 try{
  const simulation=config.fixtureMode&&config.simulationAllowed?simulationAdapters():undefined;
  let twitch:ReturnType<typeof connectTwitch>|undefined;
  const sendTwitch=async(message:string,source:"sim"|"twitch"="twitch")=>{if(source==="twitch"&&config.twitch&&twitch)await twitch.sendChat(message);};
  const pipeline=new WorldPipeline(Date.now,undefined,sendTwitch),guard=new IdeaGuard();
  const summons=new SummonService({config:config.summon,provider:simulation?.summonProvider??bedrockProvider(config.summon),mode:simulation?"fixture":"live",publish:event=>pipeline.publish(event),reply:(_chat,message,source)=>pipeline.reply(_chat,message,()=>sendTwitch(message,source))});pipeline.attachSummon(summons);
  const versions=new Versions(root,version=>pipeline.publish({type:"version",version}));await versions.init();
  const runner=new Runner({root,versions,...(simulation?.builder?{builder:simulation.builder}:{}),feed:(kind,text)=>rounds.feed(kind,text),announce:async message=>{pipeline.publish({type:"reply",message});await sendTwitch(message);}});
  const rounds=new Rounds({...(config.demoMode?{timers:DEMO_MS}:{}),build:request=>runner.build(request),rollback:requester=>runner.rollback(requester),canRollback:()=>!!versions.previous(),review:simulation?.reviewer??((idea,context)=>guard.review(idea,context.signal)),publish:state=>pipeline.publish({type:"rounds",state}),simulationAllowed:config.simulationAllowed});pipeline.attachRounds(rounds);
  let warned=false;const checkpoint=new Checkpoint(join(root,"state/world.json"),()=>({world:pipeline.checkpoint(),rounds:rounds.checkpoint(),summons:summons.checkpoint()}),()=>{if(!warned){warned=true;console.error("World checkpoint could not be saved; check state/ permissions.");}});
  const saved=await checkpoint.load();if(saved){pipeline.restore(saved.world);summons.restore(saved.summons);rounds.restore(saved.rounds,checkpoint.savedAt);}
  await runner.recover();await cleanupStaleCodexHomes(root);if(versions.current)pipeline.publish({type:"version",version:versions.current});
  let phaseKey=`${rounds.snapshot().round}:${rounds.snapshot().phase}:${rounds.snapshot().paused}`;
  const durable=async(changed=false)=>{if(changed)checkpoint.changed();await checkpoint.flush();};
  const unsubscribe=pipeline.subscribe(event=>{checkpoint.changed();let urgent=event.type==="summon"||event.type==="summon-remove"||event.type==="version"||event.type==="control";
    if(event.type==="rounds"){const key=`${event.state.round}:${event.state.phase}:${event.state.paused}`;urgent=key!==phaseKey;phaseKey=key;}
    if(urgent)void durable().catch(()=>console.error("World checkpoint could not be saved; check state/ permissions."));
  });checkpoint.changed();await durable();
  const app=await createWorldServer(pipeline,summons,rounds,versions,{durable,broadcasterId:config.broadcasterId,simulationAllowed:config.simulationAllowed,...(simulation?{setOutcome:simulation.setOutcome}:{}),live:!!config.summon.key&&!simulation,fault:async()=>{if(versions.current)await versions.invalidate(versions.current.version);rounds.cancelForRevert();rounds.externalResult(await runner.rollback("system",true));}});
  await new Promise<void>((resolve,reject)=>{app.server.once("error",reject);app.server.listen(config.port,config.host,resolve);});
  twitch=connectTwitch({onChat:(event,authority)=>{pipeline.chat(event,{...authority,source:"twitch"});},onRaid:event=>{pipeline.raid(event);}},config.twitch);
  const timers=[setInterval(()=>rounds.tick(),250),setInterval(()=>{pipeline.prune();summons.prune();},1000)];let closing=false;
  async function stop(){if(closing)return;closing=true;for(const timer of timers)clearInterval(timer);twitch?.stop();rounds.dispose();versions.close();app.closeStreams();const closed=new Promise<void>(r=>app.server.close(()=>r()));app.server.closeIdleConnections();await runner.close();await closed;checkpoint.changed();await checkpoint.close();unsubscribe();await release();}
  for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>{void stop().catch(()=>{console.error("Shutdown could not finish; recovery will run on restart.");process.exitCode=1;});});
  console.log(`World: http://${config.host}:${config.port}/world${config.demoMode?" (DEMO_MODE)":""}`);
 }catch(error){await release();throw error;}
}
void start().catch(error=>{console.error(redact(error instanceof Error?error.message:"Server startup failed.",protectedValues(process.env)));process.exitCode=1;});
