import { isWalkable } from "./land.js";

// Fixed island graph, shared by every citizen. Cache at most one field per grid cell
// (~3 MB at full coverage); following uses O(1) indexed steps after field creation.
const width = 39, depth = 31, cell = 0.5, minX = -9.5, minZ = -7.5;
const total = width * depth;
const nodes = Array.from({ length: total }, (_, i) => ({ x: minX + (i % width) * cell, z: minZ + Math.floor(i / width) * cell }));
const dry = new Uint8Array(nodes.map(p => Number(isWalkable(p.x, p.z))));
const adjacent: number[][] = nodes.map((p, i) => {
  if (!dry[i]) return [];
  const neighbors: number[] = [], ix = i % width, iz = Math.floor(i / width);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dz) || ix + dx < 0 || ix + dx >= width || iz + dz < 0 || iz + dz >= depth) continue;
    const j = i + dz * width + dx, q = nodes[j]!;
    if (dry[j] && isWalkable((p.x + q.x) / 2, (p.z + q.z) / 2) &&
      (!dx || !dz || (dry[i + dx] && dry[i + dz * width]))) neighbors.push(j);
  }
  return neighbors;
});
const fields = new Map<number, Int16Array>();
const queue = new Int16Array(total);
// Conservative grid interiors need no analytic terrain evaluation. Boundary cells retain exact tests.
const fineCell = 0.125, fineWidth = 157, fineDepth = 125;
const fine = new Uint8Array(fineWidth * fineDepth);
const corners = new Uint8Array((fineWidth+1)*(fineDepth+1));
for(let z=0;z<=fineDepth;z++)for(let x=0;x<=fineWidth;x++)corners[z*(fineWidth+1)+x]=Number(isWalkable(minX+x*fineCell,minZ+z*fineCell));
for(let z=0;z<fineDepth;z++)for(let x=0;x<fineWidth;x++){
  const i=z*(fineWidth+1)+x;
  fine[z*fineWidth+x]=Number(corners[i]&&corners[i+1]&&corners[i+fineWidth+1]&&corners[i+fineWidth+2]&&isWalkable(minX+(x+.5)*fineCell,minZ+(z+.5)*fineCell));
}

function walkable(x:number,z:number) { const ix=Math.floor((x-minX)/fineCell),iz=Math.floor((z-minZ)/fineCell);return ix>=0&&ix<fineWidth&&iz>=0&&iz<fineDepth&&!!fine[iz*fineWidth+ix] ? true : isWalkable(x,z); }
const nearestCache=new Map<number,number>();
const cellId=(x:number,z:number)=>Math.max(0,Math.min(depth-1,Math.round((z-minZ)/cell)))*width+Math.max(0,Math.min(width-1,Math.round((x-minX)/cell)));
function nearest(x: number, z: number) {
  const key=cellId(x,z),cached=nearestCache.get(key); if(cached!==undefined)return cached;
  const ix = key%width, iz=Math.floor(key/width);
  let best = -1, distance = Infinity;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    if (ix + dx < 0 || ix + dx >= width || iz + dz < 0 || iz + dz >= depth) continue;
    const i = (iz + dz) * width + ix + dx;
    if (!dry[i]) continue;
    const node = nodes[i]!, d = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (d < distance && walkable((node.x + x) / 2, (node.z + z) / 2)) { distance = d; best = i; }
  }
  nearestCache.set(key,best);return best;
}
function field(goal: number) {
  const cached = fields.get(goal);
  if (cached) return cached;
  const parents = new Int16Array(total).fill(-1);
  parents[goal] = goal; queue[0] = goal;
  let head = 0, tail = 1;
  while (head < tail) {
    const i = queue[head++]!;
    for (const j of adjacent[i]!) if (parents[j] === -1) { parents[j] = i; queue[tail++] = j; }
  }
  fields.set(goal, parents);
  return parents;
}
function step(p: { x: number; z: number }, x: number, z: number, maximum: number) {
  const dx = x - p.x, dz = z - p.z, length = Math.hypot(dx, dz);
  if (length < 0.001) return true;
  const scale = Math.min(length, maximum) / length, nx = p.x + dx * scale, nz = p.z + dz * scale;
  if (!walkable(nx, nz)) return false;
  p.x = nx; p.z = nz; return true;
}

/** Route to a dry waypoint, and recenter before a corner if cutting it would hit water. */
export function stepOnLand(p: { x: number; z: number }, targetX: number, targetZ: number, maximumStep: number) {
  if (maximumStep <= 0) return;
  if (Math.hypot(targetX-p.x,targetZ-p.z)<0.75 && walkable(targetX,targetZ) && step(p,targetX,targetZ,maximumStep)) return;
  const current = nearest(p.x, p.z), goal = nearest(targetX, targetZ);
  if (current < 0 || goal < 0) return;
  if (current === goal) { step(p, targetX, targetZ, maximumStep); return; }
  const next = field(goal)[current]!;
  if (next < 0) return;
  const waypoint = nodes[next]!;
  if (!step(p, waypoint.x, waypoint.z, maximumStep)) {
    const center = nodes[current]!; step(p, center.x, center.z, maximumStep);
  }
}
