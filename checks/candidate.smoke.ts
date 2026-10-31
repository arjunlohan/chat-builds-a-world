import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { candidateCheck } from "../server/runner/check.js";
const base=await readFile("checks/fixtures/modules/good.ts","utf8"),results=[];
for(const kind of ["good","hidden","tiny"]){
 let source=base.replace("FIXTURE_ID",`probe-${kind}`);
 if(kind==="hidden")source=source.replace("mesh.position.set(-3, 5, 0)","mesh.position.set(0, -4, 0)").replace("mesh.position.y = 5 +","mesh.position.y = -4 +");
 if(kind==="tiny")source=source.replace("IcosahedronGeometry(1.8,","IcosahedronGeometry(0.03,");
 const compiled=await build({stdin:{contents:source,loader:"ts",resolveDir:process.cwd()},bundle:true,format:"esm",platform:"browser",write:false,plugins:[{name:"shared-three",setup(b){b.onResolve({filter:/^three$/},()=>({path:"/assets/three.js",external:true}));}}]});
 const result=await candidateCheck(process.cwd(),[{id:`probe-${kind}`,file:`world/modules/probe-${kind}.ts`,code:compiled.outputFiles[0]!.text}],`probe-${kind}`,new AbortController().signal);
 results.push({kind,...result});console.log(JSON.stringify(results.at(-1)));
 assert.equal(result.ok,kind==="good",result.reason);
 if(kind!=="good")assert.match(result.reason!,/stream-readable/);
 const directory=result.evidence!;
 assert.ok((await readFile(join(directory,"input.json"))).length);
 const evidence=JSON.parse(await readFile(join(directory,"evidence.json"),"utf8"));assert.ok(evidence.frames.length>500);assert.equal(evidence.status,kind==="good"?"passed":"failed");
 assert.equal(JSON.parse(await readFile(join(directory,"result.json"),"utf8")).ok,result.ok);
}
await writeFile("state/candidate-smoke-results.json",JSON.stringify(results,null,2));
