import {test} from 'node:test';import assert from 'node:assert/strict';import {alphaCoverage,preserveAlphaCoverage} from '../world/engine/coverage-mips.js';
test('leaf mips retain cutout coverage without filling transparent texels or changing color',()=>{
 const pixels=new Uint8ClampedArray([10,20,30,0,10,20,30,50,10,20,30,70,10,20,30,110]);assert.equal(alphaCoverage(pixels,.35),.25);preserveAlphaCoverage(pixels,.35,.5);assert.equal(alphaCoverage(pixels,.35),.5);assert.equal(pixels[3],0);for(let i=0;i<4;i++)assert.deepEqual([...pixels.slice(i*4,i*4+3)],[10,20,30]);
 const thin=new Uint8ClampedArray([10,20,30,100,10,20,30,120]);const before=thin.slice();preserveAlphaCoverage(thin,.35,.1);assert.ok(thin.every((value,i)=>value>=before[i]!));
 const empty=new Uint8ClampedArray(16);preserveAlphaCoverage(empty,.35,0);assert.equal(alphaCoverage(empty,.35),0);const full=new Uint8ClampedArray(16).fill(255);preserveAlphaCoverage(full,.35,1);assert.equal(alphaCoverage(full,.35),1);
});
