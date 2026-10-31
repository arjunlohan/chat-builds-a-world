export const POLICY_LIMITS=Object.freeze({sourceBytes:65536});
export const DENIED_GLOBALS=Object.freeze("window document globalThis self global process require fetch XMLHttpRequest WebSocket Worker navigator location eval Function setTimeout setInterval requestAnimationFrame queueMicrotask Promise performance Date console importScripts Reflect Proxy".split(" "));
export const DENIED_PROPERTIES=Object.freeze("constructor __proto__ prototype parent onBeforeRender onAfterRender onBeforeCompile addEventListener removeEventListener".split(" "));
export const POLICY_RULES=Object.freeze({
 typing:{error:"Unchecked types and dynamic property access are forbidden.",text:"No any types. Bracket indices must be a numeric literal or identifier: arr[i * 3] fails; compute const j = i * 3 first, then arr[j]. Use dot properties for named fields."},
 synchronous:{error:"Modules must be synchronous; no dynamic imports.",text:"All hooks synchronous: no async, await, promises, dynamic imports, timers, workers or animation loops."},
 allocation:{error:"Per-frame geometry/material/buffer creation is forbidden.",text:"Allocate geometry, materials, attributes and typed arrays once in init, never in update; reuse them and dispose owned resources."},
 topLevel:{error:"Unsupported top-level module statement.",text:"Top level: imports, function/interface/type declarations, literal or function variables, and a default factory export only. No top-level calls, new objects, side effects, classes, enums or export declarations."},
});
