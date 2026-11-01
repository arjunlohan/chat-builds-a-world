import test from 'node:test';import assert from 'node:assert/strict';import {skyCycle,skyPreset,environmentChanged,type SkyLighting} from '../world/shared/sky-cycle.js';
test('the ten-minute cycle is at least 80 percent daylight and presets stay explicit',()=>{
 const values=Array.from({length:1000},(_,i)=>skyCycle(i/1000));assert.ok(values.filter(s=>s.day>.99).length>=800);assert.equal(skyCycle(skyPreset('day')!).day,1);assert.ok(skyCycle(skyPreset('golden')!).warmth>.5);assert.equal(skyCycle(skyPreset('night')!).day,0);assert.equal(skyPreset('night',true),0);assert.equal(skyPreset('day',true),.5);assert.equal(skyPreset('unknown'),undefined);
});
test('only effective lighting changes trigger environment rebakes, with one constant night bake',()=>{
 let saved:SkyLighting|undefined,count=0;for(let i=940;i<1000;i++){const next=skyCycle(i/1000);if(environmentChanged(saved,next)){saved=next;count++;}}assert.equal(count,1);
 saved=undefined;count=0;for(let i=0;i<6000;i++){const next=skyCycle(i/6000);if(environmentChanged(saved,next)){saved=next;count++;}}assert.ok(count<80&&count>20,String(count));
 const a=skyCycle(.47);assert.equal(environmentChanged(a,a),false);assert.equal(environmentChanged(a,{...a,day:a.day-.1}),true);assert.equal(environmentChanged(a,{...a,warmth:a.warmth+.1}),true);
});
