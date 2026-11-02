import {test} from 'node:test';import assert from 'node:assert/strict';import {captureDifference} from './capture-diff.js';
test('capture accepts sparse one-byte rounding and rejects larger or widespread pixel changes',()=>{
 const a=new Uint8Array(100*100*4),b=a.slice();b[0]=1;assert.equal(captureDifference(a,b,100,100).ok,true);b[0]=2;assert.equal(captureDifference(a,b,100,100).ok,false);b[0]=0;for(let i=0;i<51;i++)b[i*4]=1;assert.equal(captureDifference(a,b,100,100).ok,false);assert.throws(()=>captureDifference(a,b,1,1),/dimensions/);
});
