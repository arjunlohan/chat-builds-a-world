import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pageProfile} from '../world/engine/render-profile.js';
test('OBS pixels stay independent of CSS/DPR; explicit native 4K and AA fallback retain the look',()=>{
 assert.equal(pageProfile(new URLSearchParams()).width,1920);assert.equal(pageProfile(new URLSearchParams('resolution=4k')).width,3840);
 const checker=pageProfile(new URLSearchParams('check=1&resolution=4k&look=classic'));assert.equal(checker.width,160);assert.equal(checker.look,'classic');assert.equal(checker.bloom,true);
 assert.equal(pageProfile(new URLSearchParams('aa=smaa')).forceSmaa,true);
});

test('surface factory keeps classic facets but new surfaces use smooth normals and counted bevels',async()=>{
 const {surfaceMaterial}=await import('../world/engine/materials.js'),{createSpecGeometry,triangleCost}=await import('../world/engine/spec-geometry.js');
 for(const look of ['classic','new'] as const){const material=surfaceMaterial({flatShading:true},look);assert.equal(material.flatShading,look==='classic');material.dispose();
 for(const kind of ['box','sphere','cylinder','cone','torus','crystal','mushroom','tree','plane'] as const){const geometry=createSpecGeometry({id:'shape',kind,detail:1,size:[1,1,1]},look);assert.equal((geometry.index?.count??geometry.getAttribute('position').count)/3,triangleCost(kind,1,look),`${look}:${kind}`);geometry.dispose();}}
});
