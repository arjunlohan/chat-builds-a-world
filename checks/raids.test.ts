import assert from "node:assert/strict";
import {test} from "node:test";
import {WorldPipeline} from "../server/pipeline.js";
import {IDLE_MS,FADE_MS,QUIET_MS,RAID_CAP} from "../world/shared/limits.js";
import {incomingRaid,raidFixture} from "../server/twitch/raid.js";
const chat=(i:number)=>({id:`msg${i}`,userId:`user${i}`,displayName:`Neighbor${i}`,color:"#79D7CF",text:"hello",timestamp:0});
test("one roster policy gives quiet seats to both new chatters and raids",()=>{
 let now=0;const world=new WorldPipeline(()=>now);for(let i=0;i<RAID_CAP;i++)world.chat(chat(i));now=QUIET_MS;for(let i=RAID_CAP;i<300;i++)world.chat(chat(i));
 assert.equal(world.chat(chat(301)).accepted,true);assert.equal(world.roster.get("user0"),undefined);assert.ok(world.roster.get("user301"));
 const result=world.raid({id:"quiet",broadcasterId:"source",broadcasterName:"Clouds",viewerCount:1000});assert.equal(result.admitted,RAID_CAP-1);assert.equal(result.count,300);assert.ok(world.roster.get("user301"));assert.ok(world.roster.get("user150"));
 assert.equal(world.chat(chat(302)).reason,"capacity");assert.equal(world.raid({id:"full",broadcasterId:"source",broadcasterName:"Clouds",viewerCount:RAID_CAP}).admitted,0);
 now+=QUIET_MS;assert.equal(world.raid({id:"quiet-raiders",broadcasterId:"source",broadcasterName:"Clouds",viewerCount:RAID_CAP}).admitted,RAID_CAP);
});
test("EventSub simulator and live decoder filter target channels and malformed raid payloads",()=>{
 const raw=raidFixture("target",150,"AuroraCrew","raid-one");assert.equal(incomingRaid(raw,"target")!.viewerCount,150);assert.equal(incomingRaid(raw,"other"),undefined);assert.equal(incomingRaid({...raw,metadata:{...raw.metadata,message_type:"revocation"}},"target"),undefined);assert.equal(incomingRaid(raidFixture("target",-1,"AuroraCrew","bad"),"target"),undefined);
});
test("raid batches respect cap, dedupe, snapshot arrival and normal expiry",()=>{
 let now=0;const world=new WorldPipeline(()=>now);for(let i=0;i<150;i++)world.chat(chat(i));now=QUIET_MS;for(let i=150;i<300;i++)world.chat(chat(i));
 const raw=raidFixture("target",150,"AuroraCrew","live-path"),raid=incomingRaid(raw,"target")!;const result=world.raid(raid);assert.equal(result.admitted,150);assert.equal(result.replaced,150);assert.equal(result.count,300);assert.equal(world.raid(raid).reason,"duplicate");
 const raiders=world.roster.list().filter(c=>c.entry);assert.equal(raiders.length,150);assert.ok(raiders.every(c=>c.displayName.startsWith("AuroraCrew")&&c.lastActive===now&&c.speech===""));assert.equal(world.snapshot().arrival!.admitted,150);
 now+=IDLE_MS+FADE_MS;world.prune();assert.equal(world.roster.size,0);assert.equal(world.snapshot().arrival,null);
});
