import type { BufferGeometry } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
/** Untextured authored meshes keep identical normals/colors/triangles with shared vertex transforms. */
export function indexGeometry(source: BufferGeometry,preserveUv=false) {
  if(source.index)return source;
  if(!preserveUv)source.deleteAttribute("uv");const indexed=mergeVertices(source);source.dispose();return indexed;
}
