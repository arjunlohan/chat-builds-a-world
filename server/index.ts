import { Runner } from "./runner/index.js";
import { Versions } from "./versions/index.js";
import { IdeaGuard, fixtureReview } from "./guard/index.js";
import { Rounds } from "./rounds/index.js";
import { readConfig } from "./config.js";
import { createWorldServer } from "./http.js";
import { WorldPipeline } from "./pipeline.js";
import { SummonService } from "./summon/index.js";
import { connectTwitch } from "./twitch/index.js";

const config = readConfig();
const pipeline = new WorldPipeline();
const summons = new SummonService({ config: config.summon, publish: event => pipeline.publish(event),
  reply: async (_chat, message, source) => {
    pipeline.publish({ type: "reply", message });
    if (source === "twitch") if (config.twitch) await twitch.sendChat(message);
  },
});
pipeline.attachSummon(summons);
const guard = new IdeaGuard();
const versions = new Versions(process.cwd(), version => pipeline.publish({ type: "version", version })); await versions.init();
if (versions.current) pipeline.publish({ type: "version", version: versions.current });
const runner = new Runner({ root: process.cwd(), versions, feed: (kind, text) => rounds.feed(kind, text),
  announce: async message => { pipeline.publish({ type: "reply", message }); if (config.twitch) await twitch.sendChat(message); } });
await runner.recover();
const rounds = new Rounds({ build: request => runner.build(request), rollback: requester => runner.rollback(requester), canRollback: () => versions.history.length > 1, review: (idea, context) => context.fixture ? fixtureReview(idea) : guard.review(idea, context.signal), publish: state => pipeline.publish({ type: "rounds", state }), simulationAllowed: !config.twitch });
pipeline.attachRounds(rounds);
const { server, closeStreams } = await createWorldServer(pipeline, summons, rounds, versions, { live: !!config.summon.key, fault: async () => {
  rounds.cancelForRevert();
  for (let wait = 0; runner.isBusy && wait < 100; wait++) await new Promise(resolve => setTimeout(resolve, 50));
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
