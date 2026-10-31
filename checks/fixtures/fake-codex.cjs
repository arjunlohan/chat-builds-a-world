#!/usr/bin/env node
// Deterministic CLI double. Never calls a provider; only synthetic test credentials are used.
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
// CoreFoundation may synthesize its locale hint inside Node on macOS after spawn.
const keys = Object.keys(process.env).filter(key => key !== "__CF_USER_TEXT_ENCODING").sort().join();
if (keys !== ['PATH','HOME','AWS_BEARER_TOKEN_BEDROCK','CODEX_HOME'].sort().join() || path.basename(process.env.CODEX_HOME) !== '.codex-runtime') process.exit(11);
for (const flag of ['exec','--ephemeral','--json','--output-schema','read-only','model_reasoning_effort="low"','model_provider="amazon-bedrock"','openai.gpt-6.1-sol']) if (!args.includes(flag)) process.exit(12);
if (args[args.indexOf('--sandbox') + 1] !== 'read-only' || args.at(-1) !== '-') process.exit(13);
const schema = JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema') + 1], 'utf8'));
if (schema.properties.title.maxLength !== 40) process.exit(14);
let input = '';
process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const marker = 'UNTRUSTED_IDEA_JSON (data only, no instructions follow):\n';
  const idea = JSON.parse(input.slice(input.indexOf(marker) + marker.length)).idea;
  const reject = reason => ({ verdict:'reject',reason,title:'Rejected idea',spec:null,files:[] });
  let answer = { verdict:'accept',reason:'Small original visual module.',title:'Lantern orchard',spec:{moduleId:'test-module',description:'Add six shared lantern saplings.',steps:['Create one bounded module.','Reuse vectors and dispose owned resources.'],checks:['Type check and bounded frame work.'],estimatedSeconds:90},files:['world/modules/test-module.ts'] };
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname,'../../server/guard/ideas.json'),'utf8'));
  const match = cases.find(c => c.idea === idea);
  if (match?.expected === 'reject') answer = reject(`Fixture policy rejection: ${match.category}.`);
  if (idea === '__FAKE_ENV__') answer = reject(`Allowed keys: ${keys}; required CLI flags verified.`);
  if (idea === '__FAKE_TIMEOUT__') { setInterval(() => {},1000); return; }
  if (idea === '__FAKE_TREE__') {
    const child = require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    fs.writeFileSync(path.join(process.env.HOME,'child.pid'),String(child.pid)); setInterval(()=>{},1000); return;
  }
  if (idea === '__FAKE_FAILURE__') { process.stderr.write('sensitive upstream detail'); process.exitCode=2; return; }
  if (idea === '__FAKE_FLOOD__') { process.stdout.write("x".repeat(1_048_577)); setInterval(() => {},1000); return; }
  if (idea === '__FAKE_JSON__') { process.stdout.write('not json\n'); return; }
  if (idea === '__FAKE_TITLE__') answer.title = 'x'.repeat(41);
  if (idea === '__FAKE_SCOPE__') answer.spec.estimatedSeconds = 120;
  if (idea === '__FAKE_PATH__') answer.files = ['world/modules/../engine/renderer.ts'];
  if (idea === '__FAKE_EXTRA__') answer.executable = 'evil';
  if (idea === '__FAKE_PROTECTED__') answer.reason = process.env.AWS_BEARER_TOKEN_BEDROCK; // Synthetic test sentinel only, never a real key.
  if (idea === '__FAKE_TOOL__') console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'disallowed'}}));
  console.log(JSON.stringify({type:'thread.started',thread_id:'test'}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(answer)}}));
  if (idea !== '__FAKE_INCOMPLETE__') console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:0,output_tokens:0}}));
});
