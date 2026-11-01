import assert from "node:assert/strict";
import { test } from "node:test";
import { frameVerdict, summarizeFrames, visibilityVerdict, type FrameEvidence } from "./candidate-policy.js";
import { contributionFootprint } from "../world/engine/visibility.js";
const frames=(fps=60):FrameEvidence[]=>Array.from({length:900},(_,i)=>({frame:i+1,time:(i+1)*1000/fps,dt:1000/fps,cpu:.4,render:.8,module:.1}));
const summary=(values=frames(),time=15000)=>summarizeFrames({frame:0,time:0},{frame:900,time,avgFps:900000/time},values,[0,1000,3400,4000]);
test("slow host and isolated scheduler/poll gaps do not reject cheap module work",()=>{
 const base=summary(frames(31),900000/31),values=frames(30);values[100]!.dt=1300;
 const candidate=summary(values,900000/30),result=frameVerdict(base,candidate,15);assert.equal(result.ok,true);assert.equal(result.maxPollGap,2400);assert.equal(result.maxFrameGap,1300);assert.ok(result.fpsDropRatio<.04);
});
test("relative cost, module CPU, added rendering, frozen pixels and sustained collapse still fail",()=>{
 const base=summary();assert.match(frameVerdict(base,summary(frames(40),22500),15).reason!,/relative FPS/);
 const cpu=frames();for(const f of cpu)f.module=3;assert.match(frameVerdict(base,summary(cpu),15).reason!,/hook CPU/);
 const render=frames();for(const f of render)f.render=4;assert.match(frameVerdict(base,summary(render),15).reason!,/added render/);
 const collapse=frames();for(let i=10;i<13;i++)collapse[i]!.dt=1200;assert.match(frameVerdict(base,summary(collapse),15).reason!,/Sustained/);
 assert.match(frameVerdict(base,summary([]),15).reason!,/Frozen render/);assert.match(frameVerdict(base,base,1).reason!,/Frozen canvas/);
});
test("visibility uses explicit full-HD units, contrast and a readable footprint",()=>{
 const width=192,height=108,a=new Uint8Array(width*height*4),b=new Uint8Array(a.length);
 for(let y=30;y<40;y++)for(let x=50;x<60;x++)a[(y*width+x)*4]=200;
 const footprint=contributionFootprint(a,b,width,height);assert.equal(footprint.probePixels,100);assert.equal(footprint.hdPixels,10000);assert.equal(footprint.hdWidth,100);assert.equal(footprint.qualifies,true);
 assert.equal(visibilityVerdict([footprint,contributionFootprint(b,b,width,height),footprint]).ok,true);
 assert.equal(visibilityVerdict([footprint,footprint,contributionFootprint(b,b,width,height)]).ok,false,"Must still be visible at the end");
 assert.equal(contributionFootprint(b,b,width,height).qualifies,false,"Occluded or invisible objects contribute no pixels");
 const tiny=new Uint8Array(a.length);tiny[0]=255;assert.equal(contributionFootprint(tiny,b,width,height).qualifies,false);
 const faint=a.map(v=>v?5:0);assert.equal(contributionFootprint(faint,b,width,height).probePixels,0);
});
