import {prepareNamedModels} from './asset-bank.js';import {modelTemplate} from './model-template.js';import {isModelKind,type ModelName} from '../shared/model-kit.js';import type {SceneSpec} from '../../server/summon/scene-spec.js';import type {WorldLook} from './render-profile.js';
async function prepare(names:readonly string[],look:WorldLook){if(look==='classic')return;await prepareNamedModels(names,look);for(const name of names){modelTemplate(name);modelTemplate(name,true);}}
export function prepareSpecAssets(spec:SceneSpec,look:WorldLook='new'){return prepare([...new Set(spec.geometries.map(g=>g.kind).filter(isModelKind))],look);}
/** Server-audited source/type metadata survives bundling and covers computed kind expressions. */
export function prepareModuleAssets(names:readonly ModelName[],look:WorldLook='new'){return prepare(names,look);}
