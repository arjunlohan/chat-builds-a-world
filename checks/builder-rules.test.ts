import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {builderRules} from "../server/runner/rules.js";
import {runnerPrompt} from "../server/runner/codex.js";
import {inspectModule} from "../server/runner/policy.js";
import {DENIED_GLOBALS,DENIED_PROPERTIES,POLICY_RULES} from "../server/runner/policy-rules.js";
import {CANDIDATE_THRESHOLDS} from "./candidate-policy.js";
test("builder and AGENTS render the actual gate rules, including numeric indexing and unchanged thresholds",async()=>{
 const rule=builderRules(),agents=await readFile("AGENTS.md","utf8");assert.ok(agents.includes(rule));
 const prompt=await runnerPrompt(process.cwd(),{verdict:"accept",title:"Rain",reason:"Safe",spec:{moduleId:"rain",description:"Rain",steps:["Create rain"],checks:["Dispose"],estimatedSeconds:60},files:["world/modules/rain.ts"]});assert.ok(prompt.includes(rule));
 for(const name of [...DENIED_GLOBALS,...DENIED_PROPERTIES])assert.ok(rule.includes(name));
 assert.ok(rule.includes(POLICY_RULES.typing.text));assert.equal(CANDIDATE_THRESHOLDS.minFps,40);
 assert.throws(()=>inspectModule("const f = () => a[i * 3];","world/modules/test.ts"),/Unchecked types/);
 assert.doesNotThrow(()=>inspectModule("const f = () => {const j=i*3;return a[j];};","world/modules/test.ts"));
 const example=rule.split("Compliant particle indexing: ")[1]!.split("\nRun the provided")[0]!;
 assert.doesNotThrow(()=>inspectModule(`export default () => ({init(services) { ${example}\n}});`,"world/modules/test.ts"));
});
