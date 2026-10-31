import { VISIBILITY_PROBE, type Footprint } from "../world/engine/visibility.js";
export interface FrameEvidence { frame:number; time:number; dt:number; cpu:number; render:number; probe?:number }
export function frameVerdict(start:{frame:number;time:number},end:{frame:number;time:number;avgFps:number},frames:readonly FrameEvidence[],hashes:number,pollTimes:readonly number[]=[]) {
 const measured=frames.filter(f=>f.frame>start.frame&&f.frame<=end.frame),fps=1000*(end.frame-start.frame)/(end.time-start.time),maxFrameGap=Math.max(0,...measured.map(f=>f.dt));
 const maxPollGap=Math.max(0,...pollTimes.slice(1).map((time,i)=>time-pollTimes[i]!));
 const summary={maxPollGap,fps,avgFps:end.avgFps,maxFrameGap,frames:measured.length,maxCpuMs:Math.max(0,...measured.map(f=>f.cpu)),maxRenderMs:Math.max(0,...measured.map(f=>f.render))};
 let reason:string|undefined;
 if(!measured.length||end.frame<=start.frame)reason="Frozen render loop: no actual rendered frames.";
 else if(maxFrameGap>1000)reason=`Rendered frame gap ${maxFrameGap.toFixed(1)} ms exceeds 1000 ms (CPU ${summary.maxCpuMs.toFixed(1)} ms; render ${summary.maxRenderMs.toFixed(1)} ms).`;
 else if(!Number.isFinite(fps)||fps<40||end.avgFps<40)reason=`Candidate FPS below 40 (${fps.toFixed(1)}, avg ${end.avgFps.toFixed(1)}).`;
 else if(hashes<2)reason="Frozen canvas pixels.";
 return {ok:!reason,...(reason?{reason}:{}),...summary};
}
export function visibilityVerdict(samples:readonly Footprint[]) {
 const qualified=samples.filter(s=>s.qualifies),best=[...samples].sort((a,b)=>b.hdPixels-a.hdPixels)[0];
 const ok=qualified.length>=2&&!!samples.at(-1)?.qualifies;
 return {ok,qualified:qualified.length,minimumHdPixels:VISIBILITY_PROBE.minPixels,minimumHdWidth:VISIBILITY_PROBE.minWidth,minimumHdHeight:VISIBILITY_PROBE.minHeight,best,
  ...(ok?{}:{reason:`Candidate is not stream-readable: needs ${VISIBILITY_PROBE.minPixels} contrasted 1080p pixel-equivalents and ${VISIBILITY_PROBE.minWidth}x${VISIBILITY_PROBE.minHeight}px in two of three probes (best ${best?.hdPixels??0}px).`})};
}
