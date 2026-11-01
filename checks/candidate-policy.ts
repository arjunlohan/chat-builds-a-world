import { VISIBILITY_PROBE, type Footprint } from "../world/engine/visibility.js";
export interface FrameEvidence { frame:number; time:number; dt:number; cpu:number; render:number; module?:number; probe?:number }
export const CANDIDATE_THRESHOLDS=Object.freeze({warmupFrames:60,warmupTimeoutMs:12_000,candidateWarmupFrames:30,sliceSeconds:1,slicePairs:7,sampleSeconds:14,maxFpsDropRatio:.20,trimRatio:.05,costPercentile:.95,collapseFrameMs:1000,collapseConsecutive:3,minPixelHashes:2,visibilitySamples:3,qualifyingProbes:2,watchdogMs:35_000});
export function percentile(values:readonly number[],fraction:number){const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*fraction)-1)]!:0;}
export interface FrameSummary {fps:number;rawFps:number;avgFps:number;maxFrameGap:number;frames:number;maxCpuMs:number;maxRenderMs:number;moduleP95Ms:number;renderP95Ms:number;consecutiveLongFrames:number;maxPollGap:number}
/** Trim scheduler outliers from throughput, but retain every frame for sustained-collapse evidence. */
export function summarizeFrames(start:{frame:number;time:number},end:{frame:number;time:number;avgFps:number},frames:readonly FrameEvidence[],pollTimes:readonly number[]=[]):FrameSummary {
 const measured=frames.filter(f=>f.frame>start.frame&&f.frame<=end.frame),intervals=measured.map(f=>f.dt).filter(dt=>dt>0&&Number.isFinite(dt)).sort((a,b)=>a-b),trim=Math.floor(intervals.length*CANDIDATE_THRESHOLDS.trimRatio),steady=intervals.slice(trim,intervals.length-trim);
 let consecutive=0,consecutiveLongFrames=0;for(const f of measured){consecutive=f.dt>CANDIDATE_THRESHOLDS.collapseFrameMs?consecutive+1:0;consecutiveLongFrames=Math.max(consecutiveLongFrames,consecutive);}
 return {fps:steady.length?1000*steady.length/steady.reduce((a,b)=>a+b,0):0,rawFps:1000*(end.frame-start.frame)/(end.time-start.time),avgFps:end.avgFps,maxFrameGap:Math.max(0,...measured.map(f=>f.dt)),frames:measured.length,maxCpuMs:Math.max(0,...measured.map(f=>f.cpu)),maxRenderMs:Math.max(0,...measured.map(f=>f.render)),moduleP95Ms:percentile(measured.map(f=>f.module??0),CANDIDATE_THRESHOLDS.costPercentile),renderP95Ms:percentile(measured.map(f=>f.render),CANDIDATE_THRESHOLDS.costPercentile),consecutiveLongFrames,maxPollGap:Math.max(0,...pollTimes.slice(1).map((time,i)=>time-pollTimes[i]!))};
}
export function breakage(summary:FrameSummary,hashes:number){
 if(!summary.frames||!Number.isFinite(summary.fps)||summary.fps<=0)return "Frozen render loop: no actual rendered frames.";
 if(summary.consecutiveLongFrames>=CANDIDATE_THRESHOLDS.collapseConsecutive)return `Sustained render collapse: ${summary.consecutiveLongFrames} consecutive frames exceed ${CANDIDATE_THRESHOLDS.collapseFrameMs} ms.`;
 if(hashes<CANDIDATE_THRESHOLDS.minPixelHashes)return "Frozen canvas pixels.";
}
export function frameVerdict(baseline:FrameSummary,candidate:FrameSummary,hashes:number,pairs:readonly {baseline:FrameSummary;candidate:FrameSummary}[]=[]) {
 const fpsDropRatio=pairs.length?percentile(pairs.map(p=>1-p.candidate.fps/p.baseline.fps),.5):1-candidate.fps/baseline.fps,addedRenderMs=Math.max(0,candidate.renderP95Ms-baseline.renderP95Ms);
 let reason=breakage(candidate,hashes);
 if(!reason&&fpsDropRatio>CANDIDATE_THRESHOLDS.maxFpsDropRatio)reason=`Candidate relative FPS drop ${(fpsDropRatio*100).toFixed(1)}% exceeds ${CANDIDATE_THRESHOLDS.maxFpsDropRatio*100}% (baseline ${baseline.fps.toFixed(1)}, candidate ${candidate.fps.toFixed(1)}).`;
 return {ok:!reason,...(reason?{reason}:{}),...candidate,baselineFps:baseline.fps,fpsDropRatio,addedRenderMs};
}
export function visibilityVerdict(samples:readonly Footprint[]) {
 const qualified=samples.filter(s=>s.qualifies),best=[...samples].sort((a,b)=>b.hdPixels-a.hdPixels)[0];
 const ok=qualified.length>=CANDIDATE_THRESHOLDS.qualifyingProbes&&!!samples.at(-1)?.qualifies;
 return {ok,qualified:qualified.length,minimumHdPixels:VISIBILITY_PROBE.minPixels,minimumHdWidth:VISIBILITY_PROBE.minWidth,minimumHdHeight:VISIBILITY_PROBE.minHeight,best,
  ...(ok?{}:{reason:`Candidate is not stream-readable: needs ${VISIBILITY_PROBE.minPixels} contrasted 1080p pixel-equivalents and ${VISIBILITY_PROBE.minWidth}x${VISIBILITY_PROBE.minHeight}px in ${CANDIDATE_THRESHOLDS.qualifyingProbes} of ${CANDIDATE_THRESHOLDS.visibilitySamples} probes (best ${best?.hdPixels??0}px).`})};
}
