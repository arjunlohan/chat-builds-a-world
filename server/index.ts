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
const { server, closeStreams } = await createWorldServer(pipeline, summons);
const twitch = connectTwitch({ onChat: (event, authority) => { pipeline.chat(event, { ...authority, source: "twitch" }); }, onRaid: event => { pipeline.raid(event); } }, config.twitch);
const prune = setInterval(() => { pipeline.prune(); summons.prune(); }, 1000);
server.on("error", () => { console.error("Could not start local server. Check that PORT is available."); twitch.stop(); clearInterval(prune); process.exitCode = 1; });
server.listen(config.port, config.host, () => console.log(`World: http://${config.host}:${config.port}/world`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  twitch.stop(); clearInterval(prune); closeStreams(); server.close(); server.closeIdleConnections();
});
