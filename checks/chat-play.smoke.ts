import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {build} from "esbuild";
import {candidateCheck} from "../server/runner/check.js";
import {CHAT_PLAY} from "../world/shared/chat-play.js";
import {inspectModule} from "../server/runner/policy.js";
const original=await readFile("checks/fixtures/modules/chat-play.ts","utf8").then(source=>source.replace("../../../world/engine/api.js","../engine/api.js")),results=[];
for(const kind of (process.argv[2]?[process.argv[2]]:["good","small","throws","no-focus","late-throws"])){
 const id=`chat-${kind}`;let source=(kind==="late-throws"?(await readFile("checks/fixtures/modules/late-fault.ts","utf8")).replace("../../../world/engine/api.js","../engine/api.js"):original).replace("FIXTURE_ID",id);
 if(kind==="small")source=source.replace("IcosahedronGeometry(1.8,0)","IcosahedronGeometry(.6,0)").replace("body.position.y+=4","body.position.y+=1.2");
 if(kind==="throws")source=source.replace('const citizen=s.citizens.get(event.userId);','throw new Error("fixture command crash"); const citizen=s.citizens.get(event.userId);');
 if(kind==="no-focus")source=source.replaceAll(/s\.camera\.focus\(citizen\.position,\{duration:1\.5,priority:[13]\}\);/g,'');
 inspectModule(source,"world/modules/chat-play.ts");
 const code=(await build({stdin:{contents:source,loader:"ts",resolveDir:process.cwd()},bundle:true,format:"esm",platform:"browser",write:false,plugins:[{name:"shared-three",setup(b){b.onResolve({filter:/^three$/},()=>({path:"/assets/three.js",external:true}));}}]})).outputFiles[0]!.text;
 const result=await candidateCheck(process.cwd(),[{id,file:`world/modules/${id}.ts`,code}],id,new AbortController().signal,["!race"]);console.log(JSON.stringify({kind,...result}));assert.equal(result.ok,(kind==="good"||kind==="small"),result.reason);
 const evidence=JSON.parse(await readFile(result.evidence+"/evidence.json","utf8"));
 if(kind==="good"||kind==="small"){assert.equal(evidence.sent.length,CHAT_PLAY.players*CHAT_PLAY.bursts);assert.equal(evidence.commandResult.calls,evidence.sent.length);assert.ok(evidence.commandResult.focuses>=2);assert.equal(evidence.visibility.ok,true);assert.equal(evidence.end.citizenCount,300);assert.ok(evidence.playLabels.some((p:{id:string;name:string;mode:string})=>p.id==="check-0"&&p.name==="Neighbor0"&&p.mode==="tag"));}
 if(kind==="small")source=source.replace("IcosahedronGeometry(1.8,0)","IcosahedronGeometry(.6,0)").replace("body.position.y+=4","body.position.y+=1.2");
 if(kind==="throws")assert.match(result.reason!,/onChat threw/);
 if(kind==="no-focus")assert.match(result.reason!,/no camera.focus result/);
 if(kind==="late-throws"){assert.match(result.reason!,/update threw/);assert.equal(evidence.slices.length,14,"Fixture must fault after all timing slices");assert.notEqual(evidence.status,"passed");assert.match(evidence.failure.stats.moduleError,/update threw/);}
 results.push({kind,...result});
}
await writeFile("state/chat-play-gate-results.json",JSON.stringify(results,null,2));console.log("PASS: command-driven visible play, win focus, onChat exceptions and missing focus gate paths.");
