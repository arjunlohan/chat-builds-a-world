import {rename} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {readJson,atomicJson} from "./atomic.js";
interface LoadPolicy {validate?(value:unknown):boolean;migrate?(value:unknown):unknown;warn?(message:string):void}
/** Bounded trailing writes; a flush waits for its captured generation, never future traffic. */
export class Checkpoint<T>{
 private generation=0;private written=0;private writingGeneration=0;private writing:Promise<void>|undefined;
 private timer:ReturnType<typeof setTimeout>|undefined;private deadline:ReturnType<typeof setTimeout>|undefined;
 savedAt=0;
 constructor(private path:string,private capture:()=>T,private onError:(error:unknown)=>void=()=>{},private debounceMs=1500,private maxWaitMs=5000){}
 async load(policy:LoadPolicy={}):Promise<T|undefined>{
  let saved:{format:number;savedAt:number;value:T},migrated=false;
  try{
   const raw=await readJson<{format?:number}>(this.path);if(raw===undefined)return;
   migrated=raw?.format===1&&!!policy.migrate;
   const value=migrated?policy.migrate!(raw):raw;saved=value as typeof saved;
   if(saved?.format!==2||!Number.isFinite(saved.savedAt)||saved.value===undefined)throw new Error("Unsupported checkpoint format; expected 2.");
   if(policy.validate&&!policy.validate(saved))throw new Error("Checkpoint schema validation failed.");
  }catch(error){
   const aside=`${this.path}.invalid-${Date.now()}-${randomUUID()}.json`;
   await rename(this.path,aside);(policy.warn??console.warn)(`World checkpoint rejected (${error instanceof Error?error.message:"invalid data"}); preserved at ${aside}. Starting fresh.`);return;
  }
  if(migrated)await atomicJson(this.path,saved);this.savedAt=saved.savedAt;return saved.value;
 }
 changed(){this.generation++;this.schedule();}
 private clearTimers(){if(this.timer)clearTimeout(this.timer);if(this.deadline)clearTimeout(this.deadline);this.timer=this.deadline=undefined;}
 private schedule(){if(this.timer)clearTimeout(this.timer);const flush=()=>{void this.flush().catch(this.onError);};this.timer=setTimeout(flush,this.debounceMs);this.deadline??=setTimeout(flush,this.maxWaitMs);}
 async flush():Promise<void>{return this.through(this.generation);}
 private through(target:number):Promise<void>{
  if(this.written>=target)return Promise.resolve();
  if(this.writing){const current=this.writing;return target<=this.writingGeneration?current:current.then(()=>this.through(target));}
  this.clearTimers();const generation=this.generation,savedAt=Date.now(),value=structuredClone(this.capture());this.writingGeneration=generation;
  const write=atomicJson(this.path,{format:2,savedAt,value}).then(()=>{this.written=generation;this.savedAt=savedAt;}).finally(()=>{this.writing=undefined;if(this.written<this.generation&&!this.timer)this.schedule();});
  this.writing=write;return write;
 }
}
