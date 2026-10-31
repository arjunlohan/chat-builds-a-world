/** Serializes mutations. A preempting operation aborts active work and waits for its finally cleanup. */
export class OperationQueue {
  private closed=false;
  private readonly pending=new Set<Promise<unknown>>();
  async close(){this.closed=true;this.controller?.abort();await Promise.allSettled([...this.pending]);}
  private jobs: (() => Promise<void>)[] = [];
  private controller: AbortController | undefined;
  enqueue<T>(operation: (signal: AbortSignal) => Promise<T>, preempt = false): Promise<T> {
    if(this.closed)return Promise.reject(new Error("Runner is shutting down."));
    const result=new Promise<T>((resolve, reject) => {
      const run = async () => { const controller = new AbortController(); this.controller = controller;
        try { if(this.closed)throw new Error("Runner is shutting down.");resolve(await operation(controller.signal)); } catch (error) { reject(error); }
        finally { this.controller = undefined; this.drain(); }
      };
      if (preempt) { this.jobs.unshift(run); this.controller?.abort(); } else this.jobs.push(run);
      if (!this.controller) this.drain();
    });
    this.pending.add(result);void result.then(()=>this.pending.delete(result),()=>this.pending.delete(result));return result;
  }
  private drain() { const next = this.jobs.shift(); if (next) void next(); }
}
