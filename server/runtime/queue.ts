/** Serializes mutations. A preempting operation aborts active work and waits for its finally cleanup. */
export class OperationQueue {
  private jobs: (() => Promise<void>)[] = [];
  private controller: AbortController | undefined;
  private waiters: (() => void)[] = [];
  get busy() { return !!this.controller || this.jobs.length > 0; }
  idle(): Promise<void> { return this.busy ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve(); }
  enqueue<T>(operation: (signal: AbortSignal) => Promise<T>, preempt = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = async () => { const controller = new AbortController(); this.controller = controller;
        try { resolve(await operation(controller.signal)); } catch (error) { reject(error); }
        finally { this.controller = undefined; this.drain(); }
      };
      if (preempt) { this.jobs.unshift(run); this.controller?.abort(); } else this.jobs.push(run);
      if (!this.controller) this.drain();
    });
  }
  private drain() { const next = this.jobs.shift(); if (next) void next(); else { for (const done of this.waiters.splice(0)) done(); } }
}
