import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pageProfile} from '../world/engine/render-profile.js';
test('OBS pixels stay independent of CSS/DPR; explicit native 4K and AA fallback retain the look',()=>{
 assert.equal(pageProfile(new URLSearchParams()).width,1920);assert.equal(pageProfile(new URLSearchParams('resolution=4k')).width,3840);
 const checker=pageProfile(new URLSearchParams('check=1&resolution=4k&look=classic'));assert.equal(checker.width,160);assert.equal(checker.look,'classic');assert.equal(checker.bloom,true);
 assert.equal(pageProfile(new URLSearchParams('aa=smaa')).forceSmaa,true);
});
