import { readConfig } from "../config.js";
import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import {launchWorldPage} from "../../checks/browser.js";
/** One polling path observes promotion before waiting for its live acknowledgement. */
async function waitForLiveRound(base: string, round: number, initialVersion: number, resume: () => Promise<unknown>) {
  const deadline=Date.now()+240_000;let resumed=false;
  while(Date.now()<deadline){
    const response=await fetch(`${base}/api/world`);if(!response.ok)throw new Error("World state unavailable");
    const snapshot=await response.json() as {version:{version:number}|null;rounds:{round:number;phase:string;guard:{status:string;reason:string;latencyMs:number};build:{status:string}}};
    if(snapshot.version&&snapshot.version.version!==initialVersion&&!resumed){resumed=true;await resume();}
    if(snapshot.rounds.round>round&&snapshot.rounds.phase==="ideas")return snapshot.rounds;
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error("Live round exceeded its watchdog.");
}
loadEnv({ quiet: true });
if (!process.env.AWS_BEARER_TOKEN_BEDROCK?.trim()) {
  console.error("runner:live requires AWS_BEARER_TOKEN_BEDROCK. No request or Git operation was started."); process.exitCode = 1;
} else {
  const base = `http://127.0.0.1:${readConfig().port}`;
  let reloads=0;const {browser,page}=await launchWorldPage(base,"",{onPage(page){page.on("framenavigated",frame=>{if(frame===page.mainFrame())reloads++;});}});reloads=0;
  try {
    // Benchmark orchestration owns suspension; production renderer needs no test-only mode.
    await page.waitForFunction(()=>window.__worldStats?.moduleSwaps>0);
    const initialVersion=await page.evaluate(()=>window.__worldStats?.moduleVersion);
    const cdp=await page.context().newCDPSession(page);await cdp.send("Page.setWebLifecycleState",{state:"frozen"});
    const response = await fetch(`${base}/runner/live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea: process.argv.slice(2).join(" ") || "Add one original amber crystal that gently floats above the ridge." }) });
    if (!response.ok) throw new Error("Live round refused. Restart dev with the key, clean master and an empty idea round.");
    const { round } = await response.json() as { round: number };
    const state=await waitForLiveRound(base,round,initialVersion,()=>cdp.send("Page.setWebLifecycleState",{state:"active"}));
    await cdp.send("Page.setWebLifecycleState",{state:"active"});
        if (state.guard.status === "rejected") { console.log(`Guard rejected: ${state.guard.reason}`); process.exitCode = 1; }
        else {
          const last = (await readFile("state/runner-metrics.jsonl", "utf8")).trim().split("\n").at(-1); console.log(JSON.stringify({guard:state.guard,runner:last?JSON.parse(last):null,hotSwap:{reloads,stats:await page.evaluate(()=>({version:window.__worldStats.moduleVersion,swaps:window.__worldStats.moduleSwaps}))}})); if(reloads)throw new Error("Hot swap reloaded the page");
          if (state.build.status !== "shipped") process.exitCode = 1;
        }
  } catch { console.error("Live round did not ship; inspect the local overlay and sanitized state metrics."); process.exitCode = 1; }
  finally { await browser.close(); }
}
