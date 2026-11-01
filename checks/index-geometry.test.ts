import test from 'node:test';import assert from 'node:assert/strict';import {BoxGeometry} from 'three';import {indexGeometry} from '../world/engine/index-geometry.js';
test('textured garden indexing preserves UV seams; the classic untextured recipe stays unchanged',()=>{
 const textured=indexGeometry(new BoxGeometry().toNonIndexed(),true),classic=indexGeometry(new BoxGeometry().toNonIndexed());assert.ok(textured.index);assert.equal(textured.getAttribute('uv').count,textured.getAttribute('position').count);assert.ok(new Set(textured.getAttribute('uv').array).size>1);assert.equal(classic.getAttribute('uv'),undefined);assert.equal(textured.index!.count,classic.index!.count);textured.dispose();classic.dispose();
});
