/** Only a classified candidate defect may opt in to a builder repair. */
export type GateVerdict={ok:true;reason?:never;category?:never;retryable?:never}|{ok:false;reason:string;category:"candidate"|"infrastructure"|"precondition";retryable:boolean};
export type GateFailure=Extract<GateVerdict,{ok:false}>;
export const candidateRejected=(reason:string):GateFailure=>({ok:false,reason,category:"candidate",retryable:true});
export const infrastructureFailed=(reason:string):GateFailure=>({ok:false,reason,category:"infrastructure",retryable:false});
export const preconditionFailed=(reason:string):GateFailure=>({ok:false,reason,category:"precondition",retryable:false});
export class CandidateCodeError extends Error {}
export class GateError extends Error {constructor(readonly verdict:Extract<GateVerdict,{ok:false}>){super(verdict.reason);}}
export const isGateVerdict=(value:unknown):value is GateVerdict=>{
 if(!value||typeof value!=="object")return false;const v=value as Record<string,unknown>;
 return v.ok===true||v.ok===false&&typeof v.reason==="string"&&typeof v.retryable==="boolean"&&["candidate","infrastructure","precondition"].includes(String(v.category))&&(v.retryable===false||v.category==="candidate");
};

export function worldHealth(state:{moduleError?:string|undefined;moduleLoadError?:string|undefined;bootError?:string|undefined},baseline=false){const infrastructure=state.bootError||state.moduleLoadError;return infrastructure?infrastructureFailed(infrastructure):state.moduleError?(baseline?infrastructureFailed(state.moduleError):candidateRejected(state.moduleError)):undefined;}
