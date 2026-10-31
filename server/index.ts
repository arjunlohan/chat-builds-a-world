import { simulationAdapters } from "./sim/adapters.js";
import { bedrockProvider } from "./summon/provider.js";
import { Runner } from "./runner/index.js";
import { Versions } from "./versions/index.js";
import { IdeaGuard } from "./guard/index.js";
import { Rounds } from "./rounds/index.js";
import { readConfig } from "./config.js";
import { createWorldServer } from "./http.js";
import { WorldPipeline } from "./pipeline.js";
import { SummonService } from "./summon/index.js";
import { connectTwitch } from "./twitch/index.js";

const config = readConfig();
const simulation = config.fixtureMode && config.simulationAllowed ? simulationAdapters() : undefined;
const adapters = { reviewer: simulation?.reviewer ?? ((idea: string, context: { signal: AbortSignal }) => guard.review(idea, context.signal)), builder: simulation?.builder, summonProvider: simulation?.summonProvider ?? bedrockProvider(config.summon) };
const pipeline = new WorldPipeline();
const summons = new SummonService({ config: config.summon, provider: adapters.summonProvider, mode: simulation ? "fixture" : "live", publish: event => pipeline.publish(event),
  reply: async (_chat, message, source) => {
    pipeline.reply(_chat, message, async () => { if (source === "twitch" && config.twitch) await twitch.sendChat(message); });
  },
});
pipeline.attachSummon(summons);
const guard = new IdeaGuard();
const versions = new Versions(process.cwd(), version => pipeline.publish({ type: "version", version })); await versions.init();
if (versions.current) pipeline.publish({ type: "version", version: versions.current });
const runner = new Runner({ root: process.cwd(), versions, ...(adapters.builder ? { builder: adapters.builder } : {}), feed: (kind, text) => rounds.feed(kind, text),
  announce: async message => { pipeline.publish({ type: "reply", message }); if (config.twitch) await twitch.sendChat(message); } });
await runner.recover();
const rounds = new Rounds({ build: request => runner.build(request), rollback: requester => runner.rollback(requester), canRollback: () => !!versions.previous(), review: adapters.reviewer, publish: state => pipeline.publish({ type: "rounds", state }), simulationAllowed: config.simulationAllowed });
pipeline.attachRounds(rounds);
const { server, closeStreams } = await createWorldServer(pipeline, summons, rounds, versions, { simulationAllowed: config.simulationAllowed, ...(simulation ? { setOutcome: simulation.setOutcome } : {}), live: !!config.summon.key && !simulation, fault: async () => {
  if (versions.current) await versions.invalidate(versions.current.version);
  rounds.cancelForRevert();
  rounds.externalResult(await runner.rollback("system", true));
} });
const twitch = connectTwitch({ onChat: (event, authority) => { pipeline.chat(event, { ...authority, source: "twitch" }); }, onRaid: event => { pipeline.raid(event); } }, config.twitch);
const roundClock = setInterval(() => rounds.tick(), 250);
const prune = setInterval(() => { pipeline.prune(); summons.prune(); }, 1000);
server.on("error", () => { console.error("Could not start local server. Check that PORT is available."); twitch.stop(); clearInterval(prune); clearInterval(roundClock); process.exitCode = 1; });
server.listen(config.port, config.host, () => console.log(`World: http://${config.host}:${config.port}/world`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  rounds.dispose(); versions.close(); twitch.stop(); clearInterval(prune); clearInterval(roundClock); closeStreams(); server.close(); server.closeIdleConnections();
});
