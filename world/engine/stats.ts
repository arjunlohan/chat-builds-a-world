export interface WorldStats { fps: number; avgFps: number; frame: number; citizenCount: number; raidCount: number; cameraFocuses: number }

/** Real presentation timing, not simulation dt. Pauses never count as slow frames. */
export class FrameStats {
  readonly value: WorldStats = { fps: 0, avgFps: 0, frame: 0, citizenCount: 0, raidCount: 0, cameraFocuses: 0 };
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
