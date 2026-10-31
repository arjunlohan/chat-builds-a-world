import { readConfig } from "./config.js";
import { createWorldServer } from "./http.js";
import { WorldPipeline } from "./pipeline.js";
import { connectTwitch } from "./twitch/index.js";

const config = readConfig();
const pipeline = new WorldPipeline();
const { server, closeStreams } = await createWorldServer(pipeline);
const twitch = connectTwitch({ onChat: (event, authority) => { pipeline.chat(event, authority); }, onRaid: event => { pipeline.raid(event); } }, config.twitch);
const prune = setInterval(() => pipeline.prune(), 1000);
server.on("error", () => { console.error("Could not start local server. Check that PORT is available."); twitch.stop(); clearInterval(prune); process.exitCode = 1; });
server.listen(config.port, config.host, () => console.log(`World: http://${config.host}:${config.port}/world`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  twitch.stop(); clearInterval(prune); closeStreams(); server.close(); server.closeIdleConnections();
});
