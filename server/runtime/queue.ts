/** Serializes mutations. A preempting operation aborts active work and waits for its finally cleanup. */
export class OperationQueue {
  private jobs: (() => Promise<void>)[] = [];
  private controller: AbortController | undefined;
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
  private drain() { const next = this.jobs.shift(); if (next) void next(); }
}
