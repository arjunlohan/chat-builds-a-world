import assert from "node:assert/strict";
import {test} from "node:test";
import {WorldPipeline} from "../server/pipeline.js";
import {IDLE_MS,FADE_MS} from "../world/shared/limits.js";
import {raidAdmission} from "../server/citizens/raid-policy.js";
import {incomingRaid,raidFixture} from "../server/twitch/raid.js";
const chat=(i:number)=>({id:`msg${i}`,userId:`user${i}`,displayName:`Neighbor${i}`,color:"#79D7CF",text:"hello",timestamp:0});
test("raid policy fills free seats then evicts oldest idle citizens, never recent chatters",()=>{
 let now=0;const world=new WorldPipeline(()=>now);for(let i=0;i<150;i++)world.chat(chat(i));now=IDLE_MS;for(let i=150;i<300;i++)world.chat(chat(i));
 const plan=raidAdmission(world.roster.list(),1000,now);assert.equal(plan.count,150);assert.equal(plan.evictIds.length,150);assert.ok(plan.evictIds.every(id=>Number(id.slice(4))<150));assert.equal(world.roster.size,300,"Policy is pure");
 const recent=world.roster.list().map(c=>({...c,lastActive:now}));assert.deepEqual(raidAdmission(recent,150,now),{count:0,evictIds:[]});assert.equal(raidAdmission(recent.slice(0,280),150,now).count,20);assert.equal(raidAdmission([],1,now).count,1);
});
test("EventSub simulator and live decoder filter target channels and malformed raid payloads",()=>{
 const raw=raidFixture("target",150,"AuroraCrew","raid-one");assert.equal(incomingRaid(raw,"target")!.viewerCount,150);assert.equal(incomingRaid(raw,"other"),undefined);assert.equal(incomingRaid({...raw,metadata:{...raw.metadata,message_type:"revocation"}},"target"),undefined);assert.equal(incomingRaid(raidFixture("target",-1,"AuroraCrew","bad"),"target"),undefined);
});
test("raid batches respect cap, dedupe, snapshot arrival and normal expiry",()=>{
 let now=0;const world=new WorldPipeline(()=>now);for(let i=0;i<150;i++)world.chat(chat(i));now=IDLE_MS;for(let i=150;i<300;i++)world.chat(chat(i));
 const raw=raidFixture("target",150,"AuroraCrew","live-path"),raid=incomingRaid(raw,"target")!;const result=world.raid(raid);assert.equal(result.admitted,150);assert.equal(result.replaced,150);assert.equal(result.count,300);assert.equal(world.raid(raid).reason,"duplicate");
 const raiders=world.roster.list().filter(c=>c.raid);assert.equal(raiders.length,150);assert.ok(raiders.every(c=>c.displayName.startsWith("AuroraCrew")&&c.lastActive===now&&c.speech===""));assert.equal(world.snapshot().arrival!.admitted,150);
 now+=IDLE_MS+FADE_MS;world.prune();assert.equal(world.roster.size,0);assert.equal(world.snapshot().arrival,null);
});
