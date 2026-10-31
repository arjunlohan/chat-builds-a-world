export interface WorldStats { fps: number; avgFps: number; frame: number; citizenCount: number; raidCount: number; cameraFocuses: number; summonCount: number; summonFocuses: number; commandReactions: number; moduleVersion: number; moduleCount: number; moduleSwaps: number; moduleError: string; modulePixels: number; updateMs: number; renderMs: number; cacheRenders: number; triangles: number; maxFrameGap: number }

/** Real presentation timing, not simulation dt. Pauses never count as slow frames. */
export class FrameStats {
  readonly value: WorldStats = { fps: 0, avgFps: 0, frame: 0, citizenCount: 0, raidCount: 0, cameraFocuses: 0, summonCount: 0, summonFocuses: 0, commandReactions: 0, moduleVersion: 0, moduleCount: 0, moduleSwaps: 0, moduleError: "", modulePixels: 0, updateMs: 0, renderMs: 0, cacheRenders: 0, triangles: 0, maxFrameGap: 0 };
  private last: number | undefined;
  private readonly samples = new Float64Array(120);
  private cursor = 0;
  private count = 0;
  private total = 0;

  resetClock() { this.last = undefined; }

  sample(now: number): number {
    const elapsed = this.last === undefined ? 0 : Math.max(0, now - this.last);
    this.last = now;
    this.value.frame++;
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
