export interface FrameTrace { frames: Uint32Array; times: Float64Array; intervals: Float32Array; cpu: Float32Array; module: Float32Array; render: Float32Array; probe: Float32Array; size: number; cursor: number }
export interface WorldStats { fps: number; avgFps: number; frame: number; citizenCount: number; raidCount: number; raidPortalActive:boolean; cameraFocuses: number; summonCount: number; summonFocuses: number; commandReactions: number; moduleVersion: number; moduleCount: number; moduleSwaps: number; moduleError: string; modulePixels: number; updateMs: number; moduleMs: number; moduleChats:number; moduleFocuses:number; measureCameraLocked:boolean; renderMs: number; triangles: number; maxFrameGap: number; lastFrameAt: number; probeRequest: number; probeCompleted: number; moduleProbePixels: number; moduleWidth: number; moduleHeight: number }

/** Real presentation timing, not simulation dt. Pauses never count as slow frames. */
export class FrameStats {
  readonly value: WorldStats = { fps: 0, avgFps: 0, frame: 0, citizenCount: 0, raidCount: 0, raidPortalActive:false, cameraFocuses: 0, summonCount: 0, summonFocuses: 0, commandReactions: 0, moduleVersion: 0, moduleCount: 0, moduleSwaps: 0, moduleError: "", modulePixels: 0, updateMs: 0, moduleMs: 0, moduleChats:0, moduleFocuses:0, measureCameraLocked:false, renderMs: 0, triangles: 0, maxFrameGap: 0, lastFrameAt: 0, probeRequest: 0, probeCompleted: 0, moduleProbePixels: 0, moduleWidth: 0, moduleHeight: 0 };
  private last: number | undefined;
  private readonly samples = new Float64Array(120);
  private cursor = 0;
  private count = 0;
  private total = 0;

  readonly trace: FrameTrace | undefined;
  constructor(capture=0) { if(capture)this.trace={frames:new Uint32Array(capture),times:new Float64Array(capture),intervals:new Float32Array(capture),cpu:new Float32Array(capture),module:new Float32Array(capture),render:new Float32Array(capture),probe:new Float32Array(capture),size:0,cursor:0}; }
  recordWork(probeMs=0) { const t=this.trace;if(!t)return;const i=(t.cursor+t.frames.length-1)%t.frames.length;t.cpu[i]=this.value.updateMs;t.module[i]=this.value.moduleMs;t.render[i]=this.value.renderMs;t.probe[i]=probeMs; }

  resetClock() { this.last = undefined; }

  sample(now: number): number {
    const elapsed = this.last === undefined ? 0 : Math.max(0, now - this.last);
    this.last = now;
    this.value.frame++; this.value.lastFrameAt=now;
    if(this.trace){const t=this.trace,i=t.cursor;t.frames[i]=this.value.frame;t.times[i]=now;t.intervals[i]=elapsed;t.cursor=(i+1)%t.frames.length;t.size=Math.min(t.size+1,t.frames.length);}
    if (elapsed > 0) {
      this.value.maxFrameGap = Math.max(this.value.maxFrameGap, elapsed);
      this.total -= this.samples[this.cursor]!;
      this.samples[this.cursor] = elapsed;
      this.total += elapsed;
      this.cursor = (this.cursor + 1) % this.samples.length;
      this.count = Math.min(this.count + 1, this.samples.length);
      this.value.fps = 1000 / elapsed;
      this.value.avgFps = 1000 * this.count / this.total;
    }
    return elapsed / 1000;
  }
}
