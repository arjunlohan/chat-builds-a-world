import assert from "node:assert/strict";
import { test } from "node:test";
import { frameVerdict, visibilityVerdict, type FrameEvidence } from "./candidate-policy.js";
import { contributionFootprint } from "../world/engine/visibility.js";
const frames=():FrameEvidence[]=>Array.from({length:900},(_,i)=>({frame:i+1,time:(i+1)*1000/60,dt:1000/60,cpu:.4,render:.8}));
test("delayed automation polls do not label steadily rendered frames frozen",()=>{
 // Even a 2400ms gap in Playwright samples is irrelevant when all RAF intervals stayed 16.67ms.
 const result=frameVerdict({frame:0,time:0},{frame:900,time:15000,avgFps:60},frames(),15,[0,1000,3400,4000]);assert.equal(result.ok,true);assert.ok(result.maxFrameGap<17);assert.equal(result.maxPollGap,2400);
});
test("a true rendered frame gap, absent frames, low FPS or frozen pixels still fail",()=>{
 const actual=frames();actual[100]!.dt=1300;actual[99]!.cpu=1250;
 const result=frameVerdict({frame:0,time:0},{frame:900,time:15000,avgFps:60},actual,15);assert.equal(result.ok,false);assert.match(result.reason!,/1300.*CPU 1250/);
 assert.equal(frameVerdict({frame:0,time:0},{frame:0,time:15000,avgFps:60},[],15).ok,false);
 assert.equal(frameVerdict({frame:0,time:0},{frame:900,time:30000,avgFps:30},frames(),15).ok,false);
 assert.equal(frameVerdict({frame:0,time:0},{frame:900,time:15000,avgFps:60},frames(),1).ok,false);
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
