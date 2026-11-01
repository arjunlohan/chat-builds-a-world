import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {chatCommands,chatPlayRules} from "../server/runner/chat-play.js";
import {CHAT_PLAY,FOCUS_LIMITS} from "../world/shared/chat-play.js";
import {builderRules} from "../server/runner/rules.js";
import {buildGuardPrompt} from "../server/guard/index.js";
test("guard preserves commands and builder/AGENTS render the same bounded play contract",async()=>{
 const rules=chatPlayRules();assert.ok(builderRules().includes(rules));assert.ok(buildGuardPrompt('A tiny !race game').includes(rules));assert.ok((await readFile('AGENTS.md','utf8')).includes(rules));
 assert.ok(rules.includes(`${CHAT_PLAY.players} players`));assert.ok(rules.includes(`${CHAT_PLAY.normalWinSeconds} s`));assert.ok(rules.includes(`${CHAT_PLAY.winMarkerLift} units`));assert.ok(rules.includes(`priority ${CHAT_PLAY.winPriority}`));assert.equal(CHAT_PLAY.winPriority,FOCUS_LIMITS.maxPriority);
});
test("only explicit custom command tokens are probed, deduplicated and bounded",()=>{
 assert.deepEqual(chatCommands({description:'!Race and !dig. Not !idea, !vote, !rollback or !pause.',steps:['Typing !RACE advances a racer.'],checks:['!dig reaches a prize.']}),['!race','!dig']);
 assert.deepEqual(chatCommands({description:'A race with no command specified',steps:[],checks:[]}),[]);
 assert.throws(()=>chatCommands({description:'!one !two !three !four !five',steps:[],checks:[]}),/at most 4/);
});
