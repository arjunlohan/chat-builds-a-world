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
    if (source === "twitch") await twitch.sendChat(message);
  },
});
pipeline.attachSummon(summons);
const guard = new IdeaGuard();
const rounds = new Rounds({ review: (idea, context) => context.fixture ? fixtureReview(idea) : guard.review(idea, context.signal), publish: state => pipeline.publish({ type: "rounds", state }), simulationAllowed: !config.twitch });
pipeline.attachRounds(rounds);
const { server, closeStreams } = await createWorldServer(pipeline, summons, rounds);
const twitch = connectTwitch({ onChat: (event, authority) => { pipeline.chat(event, { ...authority, source: "twitch" }); }, onRaid: event => { pipeline.raid(event); } }, config.twitch);
const roundClock = setInterval(() => rounds.tick(), 250);
const prune = setInterval(() => { pipeline.prune(); summons.prune(); }, 1000);
server.on("error", () => { console.error("Could not start local server. Check that PORT is available."); twitch.stop(); clearInterval(prune); clearInterval(roundClock); process.exitCode = 1; });
server.listen(config.port, config.host, () => console.log(`World: http://${config.host}:${config.port}/world`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  rounds.dispose(); twitch.stop(); clearInterval(prune); clearInterval(roundClock); closeStreams(); server.close(); server.closeIdleConnections();
});
