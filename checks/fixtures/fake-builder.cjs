#!/usr/bin/env node
const fs=require('node:fs'), path=require('node:path');
const keys=Object.keys(process.env).filter(k=>k!=='__CF_USER_TEXT_ENCODING').sort().join();
if(keys!==['PATH','HOME','AWS_BEARER_TOKEN_BEDROCK','CODEX_HOME'].sort().join())process.exit(11);
const args=process.argv.slice(2);
for(const word of ['exec','workspace-write','--json','--ephemeral','model_reasoning_effort="medium"'])if(!args.includes(word))process.exit(12);
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{
 const decision=JSON.parse(input.split('APPROVED_BUILD_JSON:\n')[1].split('\nSIMULATION_FIXTURE_KIND:')[0]),kind=/SIMULATION_FIXTURE_KIND: (\w+)/.exec(input)?.[1]??decision.spec.description;
 const emit=value=>console.log(JSON.stringify(value));
 emit({type:'turn.started'});emit({type:'item.completed',item:{type:'plan_update',plan:[{step:'Create the approved local visual',status:'in_progress'}]}});
 if(kind==='timeout'){setInterval(()=>{},1000);return;}
 if(kind==='nochange'){emit({type:'item.completed',item:{type:'command_execution',command:'private tool invocation',exit_code:1}});emit({type:'item.completed',item:{type:'agent_message',text:'I could not implement the requested service with the available API. '+process.env.AWS_BEARER_TOKEN_BEDROCK}});emit({type:'turn.completed',usage:{input_tokens:123,output_tokens:45}});return;}
 let source=fs.readFileSync(path.join(__dirname,'modules', ['throws','slow','empty'].includes(kind)?`${kind}.ts`:'good.ts'),'utf8').replace('"../../../world/engine/api.js"','"../engine/api.js"').replace('FIXTURE_ID',decision.spec.moduleId);
 if(kind==='repair')source=source.replaceAll('MeshStandardMaterial','MeshBasicMaterial').replace(', emissive: \"#593b14\", emissiveIntensity: 0.4','').replace('IcosahedronGeometry(1.8,',input.includes('REPAIR_ATTEMPT:')?'IcosahedronGeometry(2.2,':'IcosahedronGeometry(0.03,');
 if(kind==='protected')source+='\n// '+process.env.AWS_BEARER_TOKEN_BEDROCK+'\n';
 if(kind==='outside')fs.appendFileSync('README.md','\nForbidden fixture edit\n');
 if(kind==='symlink'){fs.symlinkSync(path.join(process.cwd(),'README.md'),decision.files[0]);}
 else {fs.mkdirSync(path.dirname(decision.files[0]),{recursive:true});fs.writeFileSync(decision.files[0],source);}
 setTimeout(()=>{emit({type:'item.completed',item:{type:'file_change',changes:[{path:decision.files[0],kind:'add'}]}});emit({type:'item.completed',item:{type:'command_execution',command:'checks',exit_code:0}});emit({type:'item.completed',item:{type:'agent_message',text:'Module ready for independent checks.'}});emit({type:'turn.completed',usage:{input_tokens:100,output_tokens:200}});},120);
});
