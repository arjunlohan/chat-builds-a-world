import {readFile,writeFile} from "node:fs/promises";
import {builderRules} from "../server/runner/rules.js";
const path="AGENTS.md",start="<!-- runtime-imports:start -->",end="<!-- runtime-imports:end -->";
const source=await readFile(path,"utf8"),block=`${start}\n${builderRules()}\n${end}`;
if(!source.includes(start)||!source.includes(end))throw new Error("AGENTS runtime import policy markers are missing.");
const updated=source.slice(0,source.indexOf(start))+block+source.slice(source.indexOf(end)+end.length);
if(process.argv.includes("--check")){if(updated!==source)throw new Error("AGENTS import policy drifted; run pnpm exec tsx checks/generate-module-policy.ts.");}
else await writeFile(path,updated);
