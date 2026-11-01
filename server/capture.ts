import {join} from "node:path";
import {atomicJson,readJson} from "./persistence/atomic.js";
import type {WorldPipeline} from "./pipeline.js";
import type {Versions} from "./versions/index.js";
/** A named take pins roster, clocks, overlay and a shipped module manifest across fresh pages/restarts. */
export function captureStore(pipeline:WorldPipeline,versions?:Versions){
 const pending=new Map<string,Promise<ReturnType<WorldPipeline["snapshot"]>>>();
 return async(version="latest",take="default")=>{
  if(!/^(latest|v\d{1,6})$/.test(version)||!/^[a-zA-Z0-9_-]{1,48}$/.test(take))throw new Error("Invalid capture version or take");
  const history=versions?.replay()??[],entry=version==="latest"?history.at(-1):history.find(v=>v.tag===version);
  if(version!=="latest"&&version!=="v0"&&!entry)throw new Error("Capture version is not a shipped version");
  const key=`${entry?.tag??"v0"}-${take}`;let job=pending.get(key);
  if(!job){job=(async()=>{const path=versions?join(versions.root,"state/captures",`${key}.json`):undefined,saved=path?await readJson<ReturnType<WorldPipeline["snapshot"]>>(path):undefined;if(saved)return saved;
   const snapshot=structuredClone(pipeline.snapshot());snapshot.version=entry?{...entry,receipt:"capture-playback"}:null;if(path)await atomicJson(path,snapshot);return snapshot;
  })();pending.set(key,job);if(pending.size>32)pending.delete(pending.keys().next().value!);void job.catch(()=>pending.delete(key));}return structuredClone(await job);
 };
}
