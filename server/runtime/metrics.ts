import { mkdir, appendFile } from "node:fs/promises";
export function metricWriter(directory = "state", filename = "summon-metrics.jsonl") {
  let tail = Promise.resolve();
  return (job: unknown) => {
    const record = JSON.stringify(job) + "\n";
    tail = tail.then(async () => { await mkdir(directory, { recursive: true }); await appendFile(`${directory}/${filename}`, record, { mode: 0o600 }); })
      .catch(() => { console.warn("Metrics could not be saved to state/."); });
    return tail;
  };
}
