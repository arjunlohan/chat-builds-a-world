/** Finite named surfaces. Textures resolve only to the committed local bank. */
export const MATERIAL_KIT={
 wood:{roughness:.74,metalness:0,texture:'wood'},
 'weathered-wood':{roughness:.94,metalness:0,texture:'wood'},
 stone:{roughness:.94,metalness:0,texture:'moss'},
 brick:{roughness:.92,metalness:0,texture:'brick'},
 iron:{roughness:.56,metalness:.94},brass:{roughness:.34,metalness:.9},copper:{roughness:.4,metalness:.92},gold:{roughness:.25,metalness:.96},
 paper:{roughness:.87,metalness:0,texture:'canvas'},glass:{roughness:.08,metalness:.05,opacity:.35},canvas:{roughness:.98,metalness:0,texture:'canvas'},
 rope:{roughness:.94,metalness:0,texture:'wood'},foliage:{roughness:.82,metalness:0},water:{roughness:.1,metalness:.15,opacity:.85},ice:{roughness:.17,metalness:.1,opacity:.7},
 glow:{roughness:.45,metalness:0},painted:{roughness:.52,metalness:.05},
} as const;
export type MaterialPreset=keyof typeof MATERIAL_KIT;
