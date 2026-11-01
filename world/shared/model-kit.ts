import models from './model-kit.json';
export const MODEL_KIT=models;
export type ModelName=keyof typeof MODEL_KIT;
export const isModelKind=(name:string):name is ModelName=>Object.hasOwn(MODEL_KIT,name);
export const PRIMITIVE_KINDS=['box','sphere','cylinder','cone','torus','plane','crystal','mushroom','tree'] as const;
export type PrimitiveKind=typeof PRIMITIVE_KINDS[number];
export type GeometryKind=PrimitiveKind|ModelName;
